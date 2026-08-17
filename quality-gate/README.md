# quality-gate — the quality ratchet

Canonical source of the frozen-baseline quality gate. **A PR may add code but may not worsen any metric — not even by one unit.** Deterministic, zero model cost (the same class as the Archon bash nodes), and it tests itself (every collector has a `.test.ts` beside it).

Born in project-b, hardened in Project A (`pnpm quality`, wired into `pnpm gate`), promoted to the toolbox on 2026-08-17 with two improvements: the **explicit-`any` metric** and `--update-baseline` now **creates** a missing metric entry instead of silently skipping it.

## The 8 metrics

| metric | gate | what it protects |
|---|---|---|
| `cobertura-percentual` | ✔ | global line coverage (catches dilution) |
| `uncoveredByFile` (per-file ratchet) | ✔ | local coverage regressions the global number hides |
| `linhas-descobertas` / `arquivos-com-linha-descoberta` | info | context in the report |
| `duplicacao-percentual` / `duplicacao-fragmentos` | ✔ | copies an agent will edit inconsistently |
| `regra-pura-fora-do-dominio` | ✔ | business rules born outside `domain/`+`application/` (a `.ts` with a unit test beside it, outside the rule dirs) |
| `arquivos-acima-do-limite` | ✔ | files over the size limit — where agent edits turn into mess |
| `any-explicito` | ✔ | AST count of `any` in production — type debt can only shrink |

## Importing into a project

1. Copy the `.mts`/`.test.ts` files to `scripts/quality/` and `vitest.quality.config.ts` to the repo root.
2. Dev deps: `vitest` + `@vitest/coverage-v8`, `jscpd`, `typescript`. Node ≥ 24 (runs TypeScript directly, no build).
3. `package.json` scripts:
   `"quality": "node scripts/quality/gate.mts"` and wire it into the repo gate (e.g. `"gate": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm quality"`).
4. Copy `baseline.example.json` to `quality-baseline.json` at the root, then run `pnpm quality --update-baseline` to freeze today's real numbers. Commit it — the baseline is versioned so every re-freeze shows in a diff.
5. CI runs `pnpm quality --baseline-from origin/main` — comparing against the PR's base, otherwise a PR that re-freezes approves itself.

## Adaptation points (review on import)

- `place-rule.mts` → `DIRETORIOS_DE_REGRA` (where business rules are allowed to live; default `src/domain/`, `src/application/`).
- `size.mts` → `LIMITE_DE_LINHAS` (default 400) and the production-file window (`isSizedFile`).
- `vitest.quality.config.ts` → the wide coverage slice and suite includes.
- `gate.mts` → `RAIZ` assumes `scripts/quality/` depth; `medirDuplicacao` scans `src`.

## Adding a new metric

Write the collector (pure function + test beside it), add it to `atual` in `gate.mts`, register its metadata in `DEFAULTS_DE_METRICA`, and run `pnpm quality --update-baseline` — the entry is born in the json with today's value frozen. An unregistered measured metric fails the gate loudly rather than passing silently.

## Language note

The inherited engine keeps its Portuguese comments/identifiers (from Project A); files added in the toolbox are in English. Full translation is pending together with the Portuguese-authored skills batch.
