---
name: sql-quality
description: SQL that stays fast as data grows — query shape (join fan-out, paginate-first, bounded scans), ORM and query-builder landmines, index and migration safety, slow-query diagnosis. Use whenever writing or changing SQL or ORM query-builder code (joins, GROUP BY, pagination, aggregates), writing a migration that adds indexes/columns/constraints, reviewing a diff that touches SQL, or chasing a slow query — also when the user just says "otimiza essa query", "query lenta", "por que isso demora", "cria a listagem de X" without naming SQL. Core is database-agnostic; vendor sections cover PostgreSQL first, ORM sections cover TypeORM, MikroORM, Prisma and Supabase.
---

# SQL quality

One law rules everything here: **the cost of a query is proportional to what it returns, never to the size of the database.** A screen that shows 10 rows may not scan a table to render them.

The bug class this skill exists for is invisible twice. Linters don't see it — the SQL is syntactically perfect. Dev doesn't feel it — with 50 rows everything is instantaneous. It ships silently and degrades alone as the base grows, until the day it saturates the connection pool. No gate catches it later; it is caught at writing time and at review time, which is what this skill is for.

## The three questions (answer before any query with a JOIN or GROUP BY)

1. **How many rows exist before the collapse?** JOINs multiply rows; GROUP BY and DISTINCT collapse them at the end. The cost lives in between. Write the cardinality as a formula: one chain of 1:N joins is linear in its leaves (`Q×L` lotes); crossing a second, independent branch is multiplicative (`P × Q×L`). `COUNT(DISTINCT ...)` fixes the arithmetic, never the volume the database materializes.
2. **What bounds the scan?** Point at the WHERE or LIMIT that keeps touched rows proportional to returned rows. The test: if the table were 100× larger, what would this query cost? Page-shaped output must have page-shaped cost.
3. **What actually executes?** With an ORM the answer is never just "the query I wrote": the pagination helper's cloned count query, the lazy loads in a loop, the joined eager-loads. Read the generated SQL once before shipping ([orm-and-builders.md](references/orm-and-builders.md)).

If you cannot answer the three, the query is not ready to be written.

## The catalog in one glance

| Situation | Rule | Read |
|---|---|---|
| Listing with per-row aggregates | Paginate first, aggregate later | [query-shape.md](references/query-shape.md) |
| Two 1:N branches under the same root | One chain per query; merge in memory | [query-shape.md](references/query-shape.md) |
| DISTINCT added to "fix duplicated results" | It is masking a fan-out — remove the cause | [query-shape.md](references/query-shape.md) |
| Deep pagination / infinite scroll | Keyset cursor, not OFFSET | [query-shape.md](references/query-shape.md) |
| Query per row in a loop (N+1) | Batch by parent ids — never "fix" it into one giant join | [query-shape.md](references/query-shape.md) |
| Writing through a builder / ORM relations | Read the SQL you didn't write; know your helper's count query | [orm-and-builders.md](references/orm-and-builders.md) |
| New FK, new index, DDL on a hot table | FK indexes are manual (PG); CONCURRENTLY; lock_timeout | [indexes-and-migrations.md](references/indexes-and-migrations.md) |
| Fast in dev, slow in prod | EXPLAIN (ANALYZE, BUFFERS) — the row-explosion fingerprint | [diagnosis.md](references/diagnosis.md) |
| Reviewing a diff that touches SQL | The ordered checklist, injection first | [review-checklist.md](references/review-checklist.md) |

## The floor (non-negotiable — any database, any ORM)

- **Values are bound, never interpolated** — including template strings inside builder `.where(...)` fragments and `raw()` escapes. Identifiers (an ORDER BY column) cannot be bound: map them through an allowlist.
- **Every scan has a bound.** A join/aggregate query with no WHERE and no LIMIT proportional to its output is a defect even while it is still fast.
- **DDL on a hot table never queues the world** — `lock_timeout` + retry, and index creation takes the concurrent path.

## Portable core, vendor edges

The core is relational algebra: fan-out, bounds and pagination behave identically in PostgreSQL, MySQL and SQL Server, raw or through any ORM. Vendor- and ORM-specific mechanics live in clearly marked sections inside the references (PostgreSQL and TypeORM / MikroORM / Prisma / Supabase are covered today). A new database or ORM **extends those sections** — it never spawns a second skill, which would fork the catalog and let the copies drift.

## The motivating incident

project-d#1126: a listing of ~10 rows joined two independent 1:N branches (`projetos` and `quadras → lotes`) under the same root, aggregated with `COUNT(DISTINCT ...)`, had no WHERE, and paginated after aggregating — while the pagination helper ran the whole thing twice in parallel. Cost proportional to the entire base; pool saturation; a migration's `ALTER TABLE` queued behind the long SELECT and took everything behind it down. The shape rules in [query-shape.md](references/query-shape.md) trace back to that diff — it is the worked example there.

## How this skill plugs into the neighbors

- **ddd-tactical** owns WHERE queries live (read side: `application/queries/`, ORM inline, own read model — its `application-cqrs.md`); this skill owns the SHAPE of what they execute. Modeling the read model is theirs; making it survive growth is here.
- **code-review**'s bug reviewer applies [review-checklist.md](references/review-checklist.md) whenever the diff touches SQL, builders or migrations.
- Cross-skill paths resolve on the canonical `~/.agents/skills/` prefix.

Credit: the classic-antipattern layer distills the four SQL skills of github/awesome-copilot (MIT — sql-optimization, sql-code-review, postgresql-optimization, postgresql-code-review); the shape layer and everything ORM came from the incident above.
