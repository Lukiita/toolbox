# Query shape — cost proportional to output

Shape is what linters cannot see: syntactically perfect SQL whose cost grows with the base instead of with the page. Eight rules; the worked example at the end is the real incident.

## 1. One chain per query — never two independent 1:N branches

A chain of 1:N joins is linear: `nucleos → quadras → lotes` produces one row per lote, which is exactly the set being counted. Add a **second branch hanging off the same root** — `nucleos → projetos` — and the database pairs every projeto with every lote: the pre-collapse set becomes `P × (Q×L)` per root row. `COUNT(DISTINCT ...)` then reports correct numbers over a multiplied volume the server still had to materialize.

How to spot it in review — three signals together:

- two LEFT JOINs whose ON conditions both anchor on the **root's** id (not on each other);
- `GROUP BY root.id`;
- `COUNT(DISTINCT ...)` or a `DISTINCT` that arrived to "fix duplicated results" — the duplicates ARE the fan-out; DISTINCT hides them from the result while the database keeps paying for them.

The fix is never a smarter join — it is **one query per branch** (rule 2 shows the full pattern).

## 2. Paginate first, aggregate later

The listing-with-counters pattern. Three steps, cost bounded by the page:

```sql
-- 1. Base: filters, order, page - NOTHING else. This is also all the count
--    query has to count (rule zero of pagination helpers, orm-and-builders.md).
SELECT nucleo.id, nucleo.nome, cidade.nome AS cidade
FROM nucleos nucleo
JOIN cidades cidade ON cidade.id = nucleo.cidade_id
ORDER BY nucleo.nome
LIMIT 10;

-- 2. One aggregation PER BRANCH, bounded by the page ids. The branches never
--    meet, so nothing multiplies; each query touches only the page's children.
SELECT quadra.nucleo_id,
       COUNT(DISTINCT quadra.id) AS quadras,
       COUNT(lote.id)            AS lotes
FROM quadras quadra
LEFT JOIN lotes lote ON lote.quadra_id = quadra.id AND lote.status = 'ATIVO'
WHERE quadra.nucleo_id IN (:pageIds) AND quadra.status = 'ATIVO'
GROUP BY quadra.nucleo_id;

SELECT projeto.nucleo_id, COUNT(DISTINCT projeto.id) AS projetos
FROM projetos projeto
WHERE projeto.nucleo_id IN (:pageIds) AND projeto.status != 'CANCELADO'
GROUP BY projeto.nucleo_id;

-- 3. Merge in memory keyed by nucleo_id; a missing key means 0.
```

Aggregating the whole base first and paginating the aggregate is the inverse order: the page discards 99% of work already done, and the count query re-does all of it (worked example below).

## 3. Every scan needs a bound — and the filter belongs where rows are born

A query with no WHERE and no LIMIT proportional to its output scans the table by construction. Apply the 100× test from the SKILL and, when the bound is a *conditional* filter (permissions are the classic), push it **into the join condition** so unwanted rows never exist:

```sql
-- Fan-out: brings every active assignment of the project, filters the user later
LEFT JOIN projeto_usuario pu ON pu.projeto_id = projeto.id AND pu.ativo = true

-- Bounded: at most one row per projeto enters the plan
LEFT JOIN projeto_usuario pu ON pu.projeto_id = projeto.id
       AND pu.ativo = true AND pu.usuario_id = :usuarioId
```

## 4. OFFSET pagination scans what it skips

`LIMIT 20 OFFSET 10000` walks and discards 10 000 rows first — page latency grows with page number. Deep or unbounded pagination (infinite scroll, exports, jobs) uses a keyset cursor:

```sql
WHERE (nome, id) > (:lastNome, :lastId)   -- row comparison: PG, MySQL 8+; expand to OR form elsewhere
ORDER BY nome, id
LIMIT 20   -- needs the matching composite index (nome, id)
```

OFFSET stays acceptable where depth is human-bounded (an admin screen nobody pages past 10).

## 5. N+1 and its evil twin

N+1 — a query per row in a loop — costs N round trips. The naive fix, "join everything into one query", recreates rule 1 the moment two collections meet. The stable middle ground is **one query per association, batched by parent ids** (`WHERE parent_id IN (...)`) — exactly what ORM select-in loaders do, and exactly the shape of rule 2's step 2.

## 6. Aggregate in one pass

One query per status is N scans of the same rows. One pass:

```sql
SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending,   -- PG
       COUNT(*) FILTER (WHERE status = 'shipped') AS shipped
FROM orders
WHERE created_at >= :since;
-- portable form: COUNT(CASE WHEN status = 'pending' THEN 1 END)
```

## 7. Presence is a semi-join

Joining just to test existence multiplies rows and then needs DISTINCT to undo it. `EXISTS (SELECT 1 ...)` is fan-out-free by construction and says what it means. The mirror case — a correlated subquery in the SELECT list running once per row — becomes a window function or a `LEFT JOIN LATERAL`.

## 8. Keep the filtered column naked (sargability)

A function over the column defeats its index: `WHERE YEAR(created_at) = 2024` scans; `WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'` seeks. When the transformation is essential (`lower(email)`), the index wraps the expression instead — [indexes-and-migrations.md](indexes-and-migrations.md).

## The worked example (project-d#1126)

The query behind a 10-row listing:

```sql
SELECT nucleo.id, nucleo.nome,
       COUNT(DISTINCT projeto.id) AS projetos,      -- corrects the arithmetic...
       COUNT(DISTINCT quadra.id)  AS quadras,
       COUNT(DISTINCT lote.id)    AS lotes
FROM nucleos nucleo
JOIN cidades cidade        ON cidade.id = nucleo.cidade_id
LEFT JOIN projetos projeto ON projeto.nucleo_id = nucleo.id AND projeto.status != 'CANCELADO'
LEFT JOIN quadras  quadra  ON quadra.nucleo_id  = nucleo.id AND quadra.status  = 'ATIVO'
LEFT JOIN lotes    lote    ON lote.quadra_id    = quadra.id AND lote.status    = 'ATIVO'
GROUP BY nucleo.id, cidade.id
-- ...but the volume before GROUP BY is P × (Q×L) per nucleo: projeto and
-- quadra both anchor on nucleo.id - rule 1's exact signature.
```

Three amplifiers on top: a permission join bringing *all* active assignments and filtering the user only afterwards (rule 3 inverted → real fan-out `P×U×T×Q×L`); **no WHERE at all**, so the whole base was aggregated to render one page; and the pagination helper cloning everything minus LIMIT as a parallel count query — two pool connections burning the full cartesian per request, where the count was mathematically just `COUNT(*) FROM nucleos JOIN cidades`.

The fix is rule 2 verbatim: paginated base (count query becomes trivial), one aggregation per branch scoped by `IN (:pageIds)`, user filter pushed into the join, merge in memory. Cost went from *entire base × 2 per request* to *page-bounded*. Symptom profile worth memorizing: instantaneous in dev, degrading alone in prod, pool saturation, and a migration's `ALTER TABLE` queued behind the long SELECT — the outage mechanics live in [indexes-and-migrations.md](indexes-and-migrations.md).
