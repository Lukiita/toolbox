# Diagnosis — from "it's slow" to the mechanism

Never optimize from code reading alone: analysis without measurement is hypothesis, and it must be labeled as such (the motivating incident's own PR says so). The workflow is evidence → fingerprint → classify → fix smallest → confirm.

## 1. Which query? Production evidence first

**PostgreSQL** — `pg_stat_statements`, ordered by where the time actually goes:

```sql
SELECT calls, mean_exec_time, rows, left(query, 100) AS query   -- PG < 13: mean_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

The shape killers have a signature here: **huge `mean_exec_time`, tiny `rows`** — all that work to return one page.

Pool saturation instead of one slow query? `pg_stat_activity` — and who blocks whom:

```sql
SELECT pid, state, now() - query_start AS running_for,
       pg_blocking_pids(pid) AS blocked_by, left(query, 80) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY running_for DESC;
```

A DDL pid blocked by a SELECT pid, with a queue behind it, is the outage pattern from [indexes-and-migrations.md](indexes-and-migrations.md).

Vendor equivalents, one line: MySQL — slow query log / `performance_schema.events_statements_summary_by_digest`; SQL Server — Query Store.

## 2. EXPLAIN (ANALYZE, BUFFERS) — read for five fingerprints

Run on prod-sized data (a replica, or staging seeded to scale — **dev data lies**; "instantaneous in dev, 30s in prod" is itself the shape fingerprint). Then look for:

- **Row explosion**: a join node whose actual rows are orders of magnitude above the final result, with the Aggregate/Unique node above it swallowing them. That is fan-out ([query-shape.md](query-shape.md) rule 1) caught red-handed.
- **`rows=` estimate vs actual off by 100×**: stale or missing statistics → `ANALYZE` the table; correlated predicates → `CREATE STATISTICS` on the column pair.
- **Seq Scan under a selective filter**: missing index, or an index defeated by a wrapped column / type mismatch (query-shape rule 8).
- **`Sort Method: external merge` / `Hash Batches > 1`**: spilling past `work_mem`. Usually volume is the disease and the spill just the symptom — fix shape before touching memory config.
- **`loops=N` on an inner node**: the plan itself is doing N+1.

## 3. Classify, then fix smallest first

Route by catalog: shape ([query-shape.md](query-shape.md)) → index ([indexes-and-migrations.md](indexes-and-migrations.md)) → statistics → server config. In that order — a shape fix usually deletes the need for the others. **Caching is never the first fix**: it hides the growth curve until the day the cache misses, and then the original query is back with a year more data.

## 4. Confirm

Re-EXPLAIN after the fix and compare buffers touched, not just wall time. In production, read the `pg_stat_statements` delta after deploy (`pg_stat_statements_reset()` on a window if the noise allows): `mean_exec_time` down, `rows` unchanged — same answer, bounded cost.
