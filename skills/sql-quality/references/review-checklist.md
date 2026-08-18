# Reviewing SQL — the ordered checklist

For diffs touching SQL, query builders or migrations. Designed to be loaded standalone by a reviewer (code-review's bug lens points here when the diff has SQL). Order is severity — walk it top-down. Report `file:line`, the mechanism in one sentence, and the fix's name; precision over coverage — a finding must survive "would this bite in production?".

1. **Interpolated values.** Any runtime value concatenated or template-stringed into SQL — including builder `.where(\`...${x}\`)` fragments and `raw()`. Fix: bind parameters; identifiers (ORDER BY columns) through an allowlist map, since they cannot be bound.
2. **Unbounded scan.** A join/aggregate query with no WHERE and no LIMIT proportional to its output. Ask the 100× question: if the table were 100× larger, what would this cost? Page-shaped output must have page-shaped cost.
3. **Cross-branch join.** Two 1:N joins both anchored on the same root id in one query, `GROUP BY root.id`, `COUNT(DISTINCT ...)` — the fan-out signature. A `DISTINCT` arriving in the diff to "fix duplicated results" is the same finding wearing a disguise. Fix: one query per branch, merged in memory (query-shape rule 2).
4. **Aggregate before paginate.** LIMIT applied on top of a base-wide aggregation instead of paginating the base and aggregating `WHERE id IN (:pageIds)`.
5. **The hidden second query.** A pagination helper whose count clones the expensive base; `limit/offset` combined with joined collections (TypeORM: silently truncates children — wrong results, not just slow).
6. **N+1.** A query inside a loop, or lazy relation access during iteration. Fix is batch-by-parent-ids — flagging it must NOT push toward one giant join, which is finding 3.
7. **Permission filter outside the join.** Join-everything-then-filter instead of restricting inside the ON to the user/tenant at hand — rows that shouldn't exist get created and then discarded.
8. **Wrapped column in a filter.** A function over the filtered column (`YEAR(col) = ...`, `lower(col) = ...`) with no matching expression index.
9. **Migration locks.** New FK without its index (PostgreSQL doesn't create one); `CREATE INDEX` without `CONCURRENTLY` on a hot table (and CONCURRENTLY still inside the runner's transaction — it can't be); DDL without `lock_timeout`; a backfill as one giant statement.
10. **`SELECT *` through joins.** Width × fan-out over the wire, and it defeats covering indexes. In app code it also couples the consumer to the schema.

Do NOT flag: SQL formatting or style; speculative indexes with no query in the diff needing them; `EXISTS` vs `IN` where both are correct and bounded; problems pre-existing outside the touched lines (code-review's global rule); the choice of ORM itself.
