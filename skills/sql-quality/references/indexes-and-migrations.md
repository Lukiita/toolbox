# Indexes and migrations — fast queries, safe deploys

Two halves of one concern: the index makes the bounded query cheap, and the migration that creates it must not take production down while doing so.

## FKs are not indexed for you (PostgreSQL)

PostgreSQL creates the constraint, **not** the index (MySQL/InnoDB creates both — the intuition imported from there is what bites). An unindexed FK hurts twice: every join or `IN` on it seq-scans the child table, and every parent `DELETE` (or cascade) scans the child *per parent row*. After adopting paginate-first, the `WHERE fk IN (:pageIds)` queries make FK indexes the load-bearing ones.

Heuristic finder (boundary-safe prefix match on the index definition):

```sql
SELECT c.conrelid::regclass AS "table", c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND (i.indkey::text = array_to_string(c.conkey, ' ')
           OR i.indkey::text LIKE array_to_string(c.conkey, ' ') || ' %')
  )
ORDER BY 1;
```

## Composite order: equality first, then range/sort

An index on `(a, b)` serves `a` and `a+b` — never `b` alone (leftmost prefix). Put `=` columns first, the range or ORDER BY column last: `(user_id, created_at)` serves the per-user timeline and makes a separate `(user_id)` index redundant.

## Partial, covering, expression — when each earns its place

```sql
-- Partial: the hot subset has a constant predicate; index only it
CREATE INDEX idx_quadras_ativas ON quadras (nucleo_id) WHERE status = 'ATIVO';

-- Covering: the hot read stops at the index, no heap fetch (PG 11+ / SQL Server)
CREATE INDEX idx_orders_covering ON orders (customer_id, created_at) INCLUDE (total);

-- Expression: required when the query wraps the column (query-shape rule 8)
CREATE INDEX idx_users_email_lower ON users (lower(email));
```

JSONB queried by containment pairs with GIN — `CREATE INDEX ... USING gin (data jsonb_path_ops)` for `@>` queries. Don't GIN a column nothing filters on.

## Over-indexing is a write tax

Every index is paid on every INSERT/UPDATE and enlarges the planner's search space. Indexes follow **queries that exist**, never speculation. Finding dead weight (PostgreSQL): `pg_stat_user_indexes WHERE idx_scan = 0` — after a full traffic cycle, those are candidates to drop.

## Types that prevent tomorrow's incident (PostgreSQL)

`TIMESTAMPTZ` over `TIMESTAMP` (naive timestamps are a timezone bug in waiting); `CITEXT` or a `lower()` expression index for emails — not both by accident; `ENUM`/`CHECK` for closed value sets so illegal states die at the column (the database as second line of defense — the domain still owns the rule, per AGENTS.md).

## Migration safety — locks are the outage vector

The mechanics, once: DDL wants `ACCESS EXCLUSIVE`. It **queues** behind any long-running SELECT's `ACCESS SHARE` — and then *everyone else queues behind the DDL*, including plain reads. A migration + one runaway listing query = full outage. That is exactly how the motivating incident escalated.

The rules:

- **`lock_timeout` on every DDL** — `SET lock_timeout = '5s'` at the top of the migration; failing fast and retrying beats queueing the world behind you.
- **`CREATE INDEX` blocks writes for the whole build** → on any hot table, `CREATE INDEX CONCURRENTLY`. It cannot run inside a transaction, so opt that migration out of the runner's wrapper (TypeORM: `migrationsTransactionMode` / CLI `-t none`; MikroORM: override `isTransactional()`; other runners have an equivalent — find it before writing the migration). A failed CONCURRENTLY build leaves an `INVALID` index behind: drop it and retry.
- **Backfills run in batches** (`UPDATE ... WHERE id IN (SELECT ... LIMIT 1000)` in a loop), never one statement holding locks and bloating WAL for the whole table.
- **`NOT NULL` on an existing column** without the long lock: `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID`, then `VALIDATE CONSTRAINT` (takes only a light lock while scanning); PG 12+ can then promote it to a real `NOT NULL` using the validated constraint.
- **Adding a column with a volatile DEFAULT rewrites the table** (any default pre-PG 11). Know the server version before assuming the fast path.
