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
| `pure-rule-outside-domain` | ✔ | business rules born outside the layer dirs: a `.ts` with a unit test beside it that is not in `domain/` or `application/` (`RULE_PATTERNS`) nor in a feature's `infra(structure)/`, `presentation/`, `use-case(s)/`, `command(s)/`, `query|queries/` (`FEATURE_LAYER_PATTERN`; a feature is a folder with a `domain/`) — works for both package-by-feature and package-by-layer layouts; a metric of place, not content |
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
6. **Prove each threshold rule bites** before trusting it: with the fitness function wired (an ESLint rule, a dependency-cruiser boundary), inject one deliberate violation, watch the gate go red, revert, watch it go green. A rule that has never failed has never been tested — a misconfigured glob passes everything silently. The ratchet proves itself the same way: worsen one gated metric by one unit and `pnpm quality` must fail. (Step borrowed from mattpocock/skills `setup-ts-deep-modules`, 2026-08-27.)
7. Optional, recommended: the ratchet **before the push** — copy `pre-push.example.sh` to `.husky/pre-push`, set the base branch and the package manager (the `ADAPT` lines). It measures against the tip of `origin/<base>`, the same point CI uses, so a re-freeze on the branch does not turn the local gate green while CI stays red (without `origin/<base>` fetched it falls back to the branch's own baseline, and says so). A worsening whose re-freeze is recorded in `quality-baseline.json` by the branch passes with a warning — unless the code is worse than what was frozen, which blocks; an unrecorded worsening blocks. Skips pushes that touch no code. By default it runs the suite, like CI; `--skip-tests` is an opt-in for projects that do not gate coverage.

## Report language

The code and console output are English. The **report** (terminal, job summary, PR comment) follows `"language"` in the project's `quality-baseline.json`: `"en"` (default) or `"pt"`. Metric labels and sections come from the same json, so they are per-project by nature — set them in whichever language the report uses. All localized strings live in `locale.mts`; adding a language is one object with the same keys (the parity test in `locale.test.ts` enforces it).

## Adaptation points (review on import)

- `place-rule.mts` → `FEATURE_SLOT` (a monorepo without `src/` re-anchors here, once), `RULE_PATTERNS` (where rules live: `domain|application`) and `FEATURE_LAYER_PATTERN` (the other layers, exempt only inside a feature that has a `domain/`). Exempt by folder, never by file suffix — see the docstrings.
- `size.mts` → `LINE_LIMIT` (default 400) and the production-file window (`isSizedFile`).
- `complexity.mts` → `CC_LIMIT` (default 5, the Richards & Ford preference; industry tolerates 10).
- `cycles.mts` → `ALIAS_PREFIXES` (non-relative import prefixes resolved as internal; default `@/` → repo root).
- `vitest.quality.config.ts` → the wide coverage slice and suite includes.
- `gate.mts` → `ROOT` assumes `scripts/quality/` depth; `measureDuplication` scans `src`.
- `pre-push.example.sh` → `BASE_BRANCH`, `QUALITY_CMD` (npm needs `npm run quality --`), and `GATE_FLAGS` (add `--skip-tests` only when coverage is not gated or the suite is too slow for a push).
- `dependency-cruiser.example.cjs` → the layer globs. The cross-feature policy is canon: **public API only** (the feature's root `index.ts`) — adapt only if a project must deviate, and record why.

## Adding a new metric

Write the collector (pure function + test beside it), add it to `current` in `gate.mts`, register its metadata in `METRIC_DEFAULTS`, and run `pnpm quality --update-baseline` — the entry is born in the json with today's value frozen. An unregistered measured metric fails the gate loudly rather than passing silently. The update also **prunes** entries no longer measured, so renames converge in one command. In CI (`--baseline-from`), the PR that adds the metric passes: the base never measured it, so the branch's frozen entry is adopted (see "When a metric worsens on purpose").

## When a metric worsens on purpose

The rule is "a PR may add code but may not worsen any metric". Sometimes the worsening is legitimate — a new server action lands with its lines uncovered, and the team decides to accept the debt. The exit path is **not** re-freezing inside the feature PR: CI compares against the PR's base, so a `quality-baseline.json` edited on the branch is ignored there and the job stays red. That is the design, otherwise a re-freezing PR approves itself.

The path that works:

1. **First check whose worsening it is.** The baseline travels in the commit. If the base re-froze after your branch left, you are measuring against a stale number — the fix is a rebase, not `--update-baseline`.
2. **If the worsening is yours, fix the code.** That is the point of the ratchet: it only exists while re-freezing is more expensive than fixing.
3. **If the debt is accepted, re-freeze in a PR of its own**, on the base, reviewed alone, with the reason in the commit body. The quality job on **that** PR is red by construction — it compares against the base, and the base holds the old number. A red job on a re-freezing PR is expected, not a failure to work around. Merge it, then rebase the feature PR.

Two cases are handled automatically when comparing against the base (`reconcileBaselineFromRev` in `compare.mts`): a **renamed metric** keeps comparing under its old name at the frozen value (`LEGACY_METRIC_KEYS` in `gate.mts`), and a **new metric** the base never measured is adopted from the branch — there was nothing to worsen. Neither case softens the local run: with no `--baseline-from`, an unregistered metric still fails.

With the pre-push hook installed (`pre-push.example.sh`), the local gate charges the **decision**, not the number: a regression against the base whose re-freeze is recorded on the branch passes with a warning that CI will be red, provided the code is no worse than what was frozen — worse than the branch's own baseline still blocks; an unrecorded regression blocks before the push. The "recorded on the branch" check diffs from the merge-base, so a re-freeze that landed on the base after the fork is not mistaken for yours: that case fails against the tip and the advice is to rebase.

## Migrating a pre-toolbox baseline (Portuguese metric keys)

Older installs (Project A) use Portuguese metric keys (`cobertura-percentual`, …). One command migrates: set `"language": "pt"` in the json if you want the report to stay Portuguese, run `pnpm quality --update-baseline`, and commit — the English keys are born from `METRIC_DEFAULTS` (edit labels/sections to Portuguese if desired) and the old keys are pruned. Note: the PR-comment marker changed from `<!-- portao-de-qualidade -->` to `<!-- quality-gate -->`, so the first CI run creates a fresh comment — delete the orphaned old one once.
