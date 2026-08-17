# quality-gate — the quality ratchet

Canonical source of the frozen-baseline quality gate. **A PR may add code but may not worsen any metric — not even by one unit.** Deterministic, zero model cost (the same class as the Archon bash nodes), and it tests itself (every collector has a `.test.ts` beside it).

In *Building Evolutionary Architectures* terms, this is an **architectural fitness function of the trend kind** — it gates on direction, not on a threshold. The threshold-kind fitness functions live beside it as templates: `eslint.fitness.example.mjs` (explicit types, complexity, depth, assertion-required tests) and `dependency-cruiser.example.cjs` (layer governance for the package-by-feature layout + cross-feature boundaries).

Born in project-b, hardened in Project A (`pnpm quality`, wired into `pnpm gate`), promoted to the toolbox on 2026-08-17 with three improvements: the **explicit-`any` metric**, `--update-baseline` now **creates and prunes** metric entries instead of silently skipping them, and the **report language is per project** (`"language": "en" | "pt"` in the baseline json) while the code is all English.

## The 10 metrics

| metric | gate | what it protects |
|---|---|---|
| `coverage-percent` | ✔ | global line coverage (catches dilution) |
| `uncoveredByFile` (per-file ratchet) | ✔ | local coverage regressions the global number hides |
| `uncovered-lines` / `files-with-uncovered-lines` | info | context in the report |
| `duplication-percent` / `duplication-fragments` | ✔ | copies an agent will edit inconsistently |
| `pure-rule-outside-domain` | ✔ | business rules born outside the layer dirs (a `.ts` with a unit test beside it, outside `RULE_PATTERNS`) — works for both package-by-feature and package-by-layer layouts |
| `circular-dependencies` | ✔ | strongly connected components in the production import graph — a cycle means nothing in it can be reused or understood alone; frozen at 0, cycles are forbidden outright |
| `files-over-limit` | ✔ | files over the size limit — where agent edits turn into mess |
| `cc-over-limit` | ✔ | functions over the cyclomatic-complexity limit (default 5) — every path is a test someone owes, and generative AI accumulates accidental complexity |
| `explicit-any` | ✔ | AST count of `any` in production — type debt can only shrink |

## Importing into a project

1. Copy the `.mts`/`.test.ts` files to `scripts/quality/` and `vitest.quality.config.ts` to the repo root.
2. Dev deps: `vitest` + `@vitest/coverage-v8`, `jscpd`, `typescript`. Node ≥ 24 (runs TypeScript directly, no build).
3. `package.json` scripts:
   `"quality": "node scripts/quality/gate.mts"` and wire it into the repo gate (e.g. `"gate": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm quality"`).
4. Copy `baseline.example.json` to `quality-baseline.json` at the root, set `"language"`, then run `pnpm quality --update-baseline` to freeze today's real numbers. Commit it — the baseline is versioned so every re-freeze shows in a diff.
5. Wire the CI from `ci.example.yml` (copy into `.github/workflows/`): the ratchet against the PR's **base** (`--baseline-from`, otherwise a re-freezing PR approves itself), the report as an edited-in-place PR comment (via the `<!-- quality-gate -->` marker), the job summary, the report artifact, and a dependency audit where **critical blocks and high warns**.

## Report language

The code and console output are English. The **report** (terminal, job summary, PR comment) follows `"language"` in the project's `quality-baseline.json`: `"en"` (default) or `"pt"`. Metric labels and sections come from the same json, so they are per-project by nature — set them in whichever language the report uses. All localized strings live in `locale.mts`; adding a language is one object with the same keys (the parity test in `locale.test.ts` enforces it).

## Adaptation points (review on import)

- `place-rule.mts` → `RULE_PATTERNS` (where business rules may live; the default accepts both `src/<feature>/domain|application/` and the flat `src/domain|application/`).
- `size.mts` → `LINE_LIMIT` (default 400) and the production-file window (`isSizedFile`).
- `complexity.mts` → `CC_LIMIT` (default 5, the Richards & Ford preference; industry tolerates 10).
- `cycles.mts` → `ALIAS_PREFIXES` (non-relative import prefixes resolved as internal; default `@/` → repo root).
- `vitest.quality.config.ts` → the wide coverage slice and suite includes.
- `gate.mts` → `ROOT` assumes `scripts/quality/` depth; `measureDuplication` scans `src`.
- `dependency-cruiser.example.cjs` → the layer globs. The cross-feature policy is canon: **public API only** (the feature's root `index.ts`) — adapt only if a project must deviate, and record why.

## Adding a new metric

Write the collector (pure function + test beside it), add it to `current` in `gate.mts`, register its metadata in `METRIC_DEFAULTS`, and run `pnpm quality --update-baseline` — the entry is born in the json with today's value frozen. An unregistered measured metric fails the gate loudly rather than passing silently. The update also **prunes** entries no longer measured, so renames converge in one command.

## Migrating a pre-toolbox baseline (Portuguese metric keys)

Older installs (Project A) use Portuguese metric keys (`cobertura-percentual`, …). One command migrates: set `"language": "pt"` in the json if you want the report to stay Portuguese, run `pnpm quality --update-baseline`, and commit — the English keys are born from `METRIC_DEFAULTS` (edit labels/sections to Portuguese if desired) and the old keys are pruned. Note: the PR-comment marker changed from `<!-- portao-de-qualidade -->` to `<!-- quality-gate -->`, so the first CI run creates a fresh comment — delete the orphaned old one once.
