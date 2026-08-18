# ORMs and query builders — the SQL you did not write

The builder chain is not the query. The ORM adds queries you never see (the count clone, the lazy loads), multiplies rows before hydration (joined eager-loads), and holds connections you didn't ask for (transactions, parallel promises). Every rule in [query-shape.md](query-shape.md) applies to the *generated* SQL — so the first rule here is about seeing it.

## Rule zero — read the generated SQL once before shipping

Any builder query with a join, aggregation or pagination: turn on query logging in dev, run it, read what came out. One read catches what no amount of staring at the fluent chain does.

| ORM | The switch (dev only) |
|---|---|
| TypeORM | `logging: ['query']` in the DataSource/connection options |
| MikroORM | `debug: true` |
| Prisma | `log: ['query']` in the client constructor |
| Supabase | `.explain()` on the builder (needs the plan feature enabled; staging) |

## Joined eager-loading multiplies before it hydrates

Two `leftJoinAndSelect` on **collections** of the same root is rule 1 of query-shape in disguise: the driver receives A×B rows, then the ORM deduplicates into pretty entity trees — the result looks right while the database paid the product. The fan-out is invisible in the objects; it only shows in the row count.

The TypeORM pagination trap on top of it:

- `.take()/.skip()` with joined collections → TypeORM runs a distinct-ids subquery first, then fetches. Heavier than it looks, but **correct**.
- `.limit()/.offset()` with joined collections → applies raw LIMIT to the *multiplied rows*: entities come back with children silently missing. Wrong results, not just slow ones.

MikroORM and Prisma default to **select-in loading** — one batched query per association (`WHERE parent_id IN (...)`), which is exactly query-shape rule 5's healthy middle ground. Opting into a joined strategy for two or more collections reintroduces the fan-out the default was protecting you from.

## Pagination helpers run a second query — know its strategy

Every `paginate(qb)` helper answers `totalItems` somehow, usually by **cloning your base query**, stripping LIMIT/OFFSET/ORDER BY, and running `COUNT(*)` over it — often in `Promise.all` with the data query: two pool connections per request, each paying whatever your base costs. nestjs-typeorm-paginate's `paginateRaw` is the documented incident case.

Paginate-first (query-shape rule 2) fixes this for free: when the base is `root JOIN dimension` with no aggregation, the count clone is trivial. If the helper's strategy doesn't fit, pass an explicit cheap count query — most helpers accept one.

Supabase: `count: 'exact'` on a list call is a real `COUNT(*)` over the filtered set in the same request; `'planned'`/`'estimated'` when an approximation serves the screen. Its embedded resources aggregate children as JSON per parent (lateral joins), so sibling embeds don't multiply each other — the cost is per-parent laterals, bounded by your page.

## Unit of work — reads that manage entities pay for tracking

In UoW ORMs (MikroORM; Hibernate-style), every loaded entity becomes managed: identity map, dirty-checking at flush. A listing that loads 5 000 entities pays memory and change-tracking for data that will never change. The read side returns **plain projections** (`qb.execute()`, raw results, a read model) — which is the same asymmetry ddd-tactical prescribes (`~/.agents/skills/ddd-tactical/references/application-cqrs.md`): aggregates for writes, projections for reads. Two rules, one mechanism.

## Raw fragments inside builders are still injection surface

```ts
qb.where(`nome = '${input}'`)        // feels typed - is string concatenation
qb.where('nome = :nome', { nome })   // bound
```

The builder gives no protection to strings you interpolate yourself. Identifiers can't be bound at all — a dynamic ORDER BY column goes through an allowlist map, never through the request. Prisma makes the distinction explicit in the names: `$queryRaw` (tagged template, binds) vs `$queryRawUnsafe` (the honest name).

## Transactions and promises hold pool connections

- A transaction spanning an external call (HTTP, AI, mail) holds its connection for the whole round trip.
- `Promise.all` of N queries inside one request takes N connections *simultaneously*.
- Pool math is worth doing aloud: pool of 10 ÷ 2 heavy queries per request = 5 concurrent requests before everyone queues. That is the saturation profile of the motivating incident.

## Per-ORM landmines (one each)

| ORM | Landmine |
|---|---|
| TypeORM | `limit/offset` with joined collections truncates children; helper count clones the full base |
| MikroORM | joined strategy on 2+ collections = fan-out; read paths through managed entities pay flush tracking |
| Prisma | `$queryRawUnsafe` with request data; interactive transactions held across external calls |
| Supabase | `count: 'exact'` on every list; RLS policies execute per row — a slow policy is a slow table |
