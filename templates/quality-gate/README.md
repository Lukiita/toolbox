# quality-gate — the quality ratchet

Canonical source of the frozen-baseline quality gate. **A PR may add code but may not worsen any metric — not even by one unit.** Deterministic, zero model cost (the same class as the Archon bash nodes), and it tests itself (every collector has a `.test.ts` beside it).

In _Building Evolutionary Architectures_ terms, this is an **architectural fitness function of the trend kind** — it gates on direction, not on a threshold. The threshold-kind fitness functions live beside it as templates: `eslint.fitness.example.mjs` (explicit types, complexity, depth, assertion-required tests) and `dependency-cruiser.example.cjs` (layer governance for the package-by-feature layout + cross-feature boundaries).

Born in project-b, hardened in Project A (`pnpm quality`, wired into `pnpm gate`), promoted to the toolbox on 2026-08-17 with three improvements: the **explicit-`any` metric**, `--update-baseline` now **creates and prunes** metric entries instead of silently skipping them, and the **report language is per project** (`"language": "en" | "pt"` in the baseline json) while the code is all English.

## The 10 metrics

| metric                                           | gate | what it protects                                                                                                                                                                                                         |
| ------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `coverage-percent`                               | ✔    | global line coverage (catches dilution)                                                                                                                                                                                  |
| `uncoveredByFile` (per-file ratchet)             | ✔    | local coverage regressions the global number hides                                                                                                                                                                       |
| `uncovered-lines` / `files-with-uncovered-lines` | info | context in the report                                                                                                                                                                                                    |
| `duplication-percent` / `duplication-fragments`  | ✔    | copies an agent will edit inconsistently                                                                                                                                                                                 |
| `pure-rule-outside-domain`                       | ✔    | business rules born outside the layer dirs: a `.ts` with a unit test beside it that is not in `domain/` or `application/` nor in a feature's `infra(structure)/`, `presentation/`, `use-case(s)/`, `command(s)/`, `query | queries/`(a feature is a folder with a`domain/`; all anchored by `quality.featureSlot`) — works for both package-by-feature and package-by-layer layouts; a metric of place, not content |
| `circular-dependencies`                          | ✔    | strongly connected components in the production import graph — a cycle means nothing in it can be reused or understood alone; frozen at 0, cycles are forbidden outright                                                 |
| `files-over-limit`                               | ✔    | files over the size limit — where agent edits turn into mess                                                                                                                                                             |
| `cc-over-limit`                                  | ✔    | functions over the cyclomatic-complexity limit (default 5) — every path is a test someone owes, and generative AI accumulates accidental complexity                                                                      |
| `explicit-any`                                   | ✔    | AST count of `any` in production — type debt can only shrink                                                                                                                                                             |

## Importing into a project

The ratchet is part of the `@lukiita/toolbox` package (ADR-0001). Nothing is copied; the project depends on it and configures it.

1. `pnpm add -D github:Lukiita/toolbox#v1.0.0` (npm: `npm i -D github:Lukiita/toolbox#v1.0.0`). Node ≥ 22.18 (22.x from 22.18, or ≥ 23.6; 23.0–23.5 cannot strip types from the `.ts` config). The tag carries the build — nothing runs on install.
2. `package.json` scripts: `"quality": "toolbox quality"`, and wire it into the repo gate (e.g. `"gate": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm quality"`).
3. Copy `node_modules/@lukiita/toolbox/templates/quality-gate/vitest.quality.config.ts` to the repo root (the wide coverage slice with no threshold — the why lives in the file) and add `vitest` + `@vitest/coverage-v8` as dev deps.
4. Copy `node_modules/@lukiita/toolbox/toolbox.config.example.ts` to the repo root as `toolbox.config.ts` and set what differs from the canonical values — see **Config** below. An empty config is the canonical setup.
5. Copy `node_modules/@lukiita/toolbox/templates/quality-gate/baseline.example.json` to `quality-baseline.json` at the root, set `"language"`, then run `pnpm quality --update-baseline` to freeze today's real numbers. Commit it — the baseline is versioned so every re-freeze shows in a diff.
6. Wire the CI from `node_modules/@lukiita/toolbox/templates/quality-gate/ci.example.yml` (copy into `.github/workflows/`): the missing-tests check as a blocking step, the ratchet against the PR's **base** (`--baseline-from`, otherwise a re-freezing PR approves itself), the report as an edited-in-place PR comment (via the `<!-- quality-gate -->` marker), the job summary, the report artifact, and a dependency audit where **critical blocks and high warns**.
7. **Prove each threshold rule bites** before trusting it: with the fitness function wired (an ESLint rule, a dependency-cruiser boundary), inject one deliberate violation, watch the gate go red, revert, watch it go green. A rule that has never failed has never been tested — a misconfigured glob passes everything silently. The ratchet proves itself the same way: worsen one gated metric by one unit and `pnpm quality` must fail. (Step borrowed from mattpocock/skills `setup-ts-deep-modules`, 2026-08-27.)
8. Optional, recommended: the ratchet **before the push** — copy `node_modules/@lukiita/toolbox/templates/quality-gate/pre-push.example.sh` to `.husky/pre-push` (husky is the project's: `pnpm add -D husky && pnpm exec husky init` if it has none). It runs `toolbox pre-push`, which measures against the tip of `origin/<base>` (the same point CI uses; `quality.baseBranch` names it) and charges the recorded decision, not the number: a worsening whose re-freeze the branch recorded passes with a warning — unless the code is worse than what was frozen, which blocks; an unrecorded worsening blocks. Skips pushes that touch no code.

Updating later is one command: `pnpm update @lukiita/toolbox` (or bump the tag in `package.json`).

## Report language

The code and console output are English. The **report** (terminal, job summary, PR comment) follows `"language"` in the project's `quality-baseline.json`: `"en"` (default) or `"pt"`. Metric labels and sections come from the same json, so they are per-project by nature — set them in whichever language the report uses. All localized strings live in `locale.mts`; adding a language is one object with the same keys (the parity test in `locale.test.ts` enforces it).

## Config (`toolbox.config.ts`, section `quality`)

Every value a project used to edit inside a copied file is a field here. The library reads it; the code is never edited in a project. Defaults are the canonical values.

| field              | default                                | what it drives                                                                                                                                                 |
| ------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceWindow`     | `/^src\//`                             | which files are production code: size, `any`, complexity, cycles, the place rule and the coverage slice. A monorepo widens it (`/^apps\/[^/]+\/src\//`).       |
| `featureSlot`      | `'^src/(?:([^/]+)/)?'`                 | the place rule's anchor — regex source with group 1 = the feature name (`src/<feature>/`), or nothing in the flat layout. A monorepo re-anchors it once.       |
| `lineLimit`        | `400`                                  | files over it enter the size count                                                                                                                             |
| `ccLimit`          | `5`                                    | functions over it enter the complexity count (Richards & Ford's preference; industry tolerates 10)                                                             |
| `aliasPrefixes`    | `{ '@/': '' }`                         | non-relative import prefixes resolved as internal for the cycle collector                                                                                      |
| `coveragePath`     | `coverage-quality/coverage-final.json` | where the coverage run writes its json (see `vitest.quality.config.ts`)                                                                                        |
| `vitestConfig`     | `vitest.quality.config.ts`             | the config the ratchet runs vitest with; `undefined` when the project default already measures the wide slice                                                  |
| `duplicationPaths` | `['src']`                              | what jscpd scans                                                                                                                                               |
| `baseBranch`       | `main`                                 | the branch PRs merge into; the pre-push hook measures against its tip                                                                                          |
| `prePushSkipTests` | `false`                                | whether the pre-push hook reuses the coverage json on disk instead of running the suite; opt in when coverage is not gated or the suite is too slow for a push |

Rule: an adaptation point without a config field is a bug — the table above is the schema, and a new knob in the code lands here in the same change.

`dependency-cruiser.example.cjs` → the layer globs. The cross-feature policy is canon: **public API only** (the feature's root `index.ts`) — adapt only if a project must deviate, and record why.

## Adding a new metric

Write the collector (pure function + test beside it, in `src/quality-gate/`), add it to `current` in `measure.mts`, register its metadata in `METRIC_DEFAULTS` (`baseline-store.mts`), and run `pnpm quality --update-baseline` — the entry is born in the json with today's value frozen. An unregistered measured metric fails the gate loudly rather than passing silently. The update also **prunes** entries no longer measured, so renames converge in one command. In CI (`--baseline-from`), the PR that adds the metric passes: the base never measured it, so the branch's frozen entry is adopted (see "When a metric worsens on purpose").

## When a metric worsens on purpose

The rule is "a PR may add code but may not worsen any metric". Sometimes the worsening is legitimate — a new server action lands with its lines uncovered, and the team decides to accept the debt. The exit path is **not** re-freezing inside the feature PR: CI compares against the PR's base, so a `quality-baseline.json` edited on the branch is ignored there and the job stays red. That is the design, otherwise a re-freezing PR approves itself.

The path that works:

1. **First check whose worsening it is.** The baseline travels in the commit. If the base re-froze after your branch left, you are measuring against a stale number — the fix is a rebase, not `--update-baseline`.
2. **If the worsening is yours, fix the code.** That is the point of the ratchet: it only exists while re-freezing is more expensive than fixing.
3. **If the debt is accepted, re-freeze in a PR of its own**, on the base, reviewed alone, with the reason in the commit body. The quality job on **that** PR is red by construction — it compares against the base, and the base holds the old number. A red job on a re-freezing PR is expected, not a failure to work around. Merge it, then rebase the feature PR.

Two cases are handled automatically when comparing against the base (`effectiveBaseline` in `compare.mts`): a **renamed metric** keeps comparing under its old name at the frozen value (`LEGACY_METRIC_KEYS` in `baseline-store.mts`), and a **new metric** the base never measured keeps the branch's own floor — there was nothing to worsen — but always gates and is named in the report as self-compared, so nobody reads a green on it as a comparison. What a metric means (direction, mode, gate) comes from `METRIC_DEFAULTS` in code, never from either baseline file: the baseline is what the pull request edits. Neither case softens the local run: with no `--baseline-from`, an unregistered metric still fails.

With the pre-push hook installed (`pre-push.example.sh`), the local gate charges the **decision**, not the number: a regression against the base whose re-freeze is recorded on the branch passes with a warning that CI will be red, provided the code is no worse than what was frozen — worse than the branch's own baseline still blocks; an unrecorded regression blocks before the push. The "recorded on the branch" check diffs from the merge-base, so a re-freeze that landed on the base after the fork is not mistaken for yours: that case fails against the tip and the advice is to rebase.

## Migrating a pre-toolbox baseline (Portuguese metric keys)

Older installs (Project A) use Portuguese metric keys (`cobertura-percentual`, …). One command migrates: set `"language": "pt"` in the json if you want the report to stay Portuguese, run `pnpm quality --update-baseline`, and commit — the English keys are born from `METRIC_DEFAULTS` (edit labels/sections to Portuguese if desired) and the old keys are pruned. Note: the PR-comment marker changed from `<!-- portao-de-qualidade -->` to `<!-- quality-gate -->`, so the first CI run creates a fresh comment — delete the orphaned old one once.
