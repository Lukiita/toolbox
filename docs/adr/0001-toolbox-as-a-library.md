# ADR-0001 — The toolbox becomes a versioned library

**Status:** Accepted (2026-09-15) — implemented in the same change; deviations recorded below

## Context

Projects import the toolbox by **copying** files: `skills/*` into `.agents/skills/`,
`hooks/` into `tools/agent-hooks/`, `quality-gate/` into `scripts/quality/`. After the
copy, the project owns the files, and they drift: `toolbox-diff.sh` on project-b shows
`code-review` 373 lines behind and `place-rule.mts` adapted by hand. Issues #1 and #2
were both "a fix born in a copy that never came back". Four consumers today
(project-b, project-c, project-d, project-a); every toolbox change needs four manual syncs.

The global symlink (`~/.agents/skills -> toolbox/skills`) solves only this machine. It
does not reach the per-project copies, CI, a cloud session, or another machine.

## Decision

One npm package, published from this repo, that carries everything projects copy today.
Projects **depend** on it by version instead of owning a copy.

```
@lukiita/toolbox            one package, one version
├── skills/                 SKILL.md folders, shipped as files
├── hooks/                  guard scripts, shipped built
└── quality-gate/           the ratchet, shipped built, config-driven
```

### The split that makes it possible: canonical vs. config

Every "adaptation point" in a README today is a value a project edits inside a copied
file. In the library those values become **parameters** read from one file in the
project, `toolbox.config.ts`:

| Today (edited on import)                          | Tomorrow (config, as shipped)           |
| ------------------------------------------------- | --------------------------------------- |
| `place-rule.mts` → `FEATURE_SLOT`, `RULE_PATTERNS` | `quality.featureSlot` (the rule patterns derive from it) |
| `size.mts` → `LINE_LIMIT`, `isSizedFile`           | `quality.lineLimit`, `quality.sourceWindow` |
| `complexity.mts` → `CC_LIMIT`                      | `quality.ccLimit`                          |
| `cycles.mts` → `ALIAS_PREFIXES`                    | `quality.aliasPrefixes`                    |
| `gate.mts` → `ROOT`, coverage path, `src` for jscpd | the git root (not configurable), `quality.coveragePath`, `quality.duplicationPaths`, `quality.vitestConfig` |
| `pre-push.example.sh` → `BASE_BRANCH`, `QUALITY_CMD`, `GATE_FLAGS` | `quality.baseBranch`, `quality.prePushSkipTests`; the one-line hook calls the binary by path |
| `check-missing-tests.mjs` → `WATCHED_PATTERNS`, `EXEMPT_SUFFIXES` | `hooks.watchedPatterns` (derived from `featureSlot` unless pinned), `hooks.exemptSuffixes` |
| `guard-bash.mjs` → `PROTECTED_BRANCHES`             | `hooks.protectedBranches` (the secrets and force-push rules are universal, no config) |

The code is never edited in a project. Only the config. Defaults equal today's canonical
values, so a project with an empty config behaves like a fresh import.

The rule to find the split, reusable anywhere: **many copies with small differences → the
differences are config, the common part is the library.**

### What stays in the project

- `package.json`: the dependency line and the scripts (`"quality": "toolbox quality"`).
- `toolbox.config.ts`: its values.
- `quality-baseline.json`: its frozen numbers (state, not code).
- `.github/workflows/quality.yml` and `.husky/pre-push`: thin, call the CLI.
- Project-local skills in `.agents/skills/` (project-c has 20 of its own) — untouched.

### How each kind of content is delivered

- **Skills** are files. `toolbox install` (the consumer's own `postinstall`, see deviations) links `node_modules/@lukiita/toolbox/skills/<name>`
  into `.agents/skills/<name>` for every skill the package ships, and touches nothing else
  in that folder. Claude, Codex and Cursor all read `.agents/skills/`, so one mechanism
  serves every agent. (A Claude Code plugin could come later, in addition, for the
  Claude-only parts: subagents, `settings.json` hooks.)
- **Hooks and quality-gate** are code, shipped **built and committed** (`dist/`; see
  deviations for why neither "ship `.mts`" nor "build on install" survives). A `toolbox` CLI exposes
  `quality`, `quality --update-baseline`, `pre-push` and `install` (skills); the hooks are
  wired by hand in `settings.json` once, from `node_modules/@lukiita/toolbox/hooks/`.
- **`agents/AGENTS.md`** is global text, not per project. It stays a symlink (or a
  pointer file), outside the package.

### Where the package lives

Start with a **git dependency, no registry**:

```json
"@lukiita/toolbox": "github:Lukiita/toolbox#v1.0.0"
```

Zero setup, private repo works, a tag is a version. Moving to GitHub Packages or npm
later is a one-line change in each consumer. Publishing = tag + push.

### Migration, one project at a time

1. Add the dependency, create `toolbox.config.ts` from the project's current adaptations
   (`toolbox-diff.sh` lists them — it is the migration checklist, then it retires).
2. Delete `scripts/quality/`, `tools/agent-hooks/`, and the toolbox-owned skills from
   `.agents/skills/`.
3. Run `pnpm quality --update-baseline` once: the numbers must not move. If they move,
   the config is wrong, not the baseline.
4. Pilot: project-a (canonical layout, fewest adaptations). Then project-b, project-c (npm),
   project-d (monorepo, most adaptations — last on purpose).

## Consequences

- **Gained:** one command updates a project (`pnpm update @lukiita/toolbox`); a fix lands
  in the library or nowhere; `toolbox-diff.sh` retires; other machines and CI get the
  same version as this one.
- **Paid:** every change needs a tag; a breaking change in the library reaches every
  project — SemVer and the project choosing when to bump are the protection; the engine
  floor rises to Node 22.18 for every consumer; `dist/` lives in git and must be rebuilt
  before every tag.
- **Risk:** config drifts from code if a new adaptation point is added to code without a
  config field. Rule: an adaptation point without a config field is a bug, and the README
  "Adaptation points" section becomes the config schema doc.

## Deviations found while implementing

- **`dist/` is committed; nothing runs on install.** Three designs were tried against real installs (2026-09-15). (1) Build on install (`prepare`): pnpm 9 runs it, pnpm 12 refuses a git-hosted dependency's build script unless `pnpm-workspace.yaml` allowlists it with the full git spec **and commit sha** — a key that breaks on every version bump. (2) Ship `.mts` and let Node strip types: works from a checkout, but Node refuses type stripping for files under `node_modules` ("Stripping types is currently unsupported for files under node_modules"), so a consumer cannot run it. (3) Build before the tag and commit `dist/`: the tag carries the build, no script runs on install, works with pnpm 12 and Node 22.23. The cost is a rule in two places — `.githooks/pre-commit` rebuilds and stages `dist/` whenever a source file is staged (`install.sh` sets `core.hooksPath`; not husky, because any lifecycle script in `package.json` would run, and be refused, on install as a git dependency), and `pnpm build:check` before a tag demands `dist/` equal to HEAD — and build output in the history.
- **The consumer runs `toolbox install`, not the package's `postinstall`.** Same root cause: a dependency's lifecycle scripts are not run. The project adds `"postinstall": "toolbox install"` to its own scripts — explicit, and it runs on every clone.
- **Config as `.ts` needs Node ≥ 22.18** (type stripping applies to the project's own files, not to `node_modules`); the loader also accepts `toolbox.config.mjs`/`.js`. Verified on Node 22.23.
- **The pre-push hook is `toolbox pre-push`, in TypeScript**, not a shell template with `ADAPT` lines: the shell version could only parse the report; in-process it gets the failures directly, and the nine decision paths have a unit test each (`src/pre-push/pre-push.test.ts`). The `.husky/pre-push` template is one line.
- **jscpd is the package's dependency**, resolved from the package, not from the project. A project whose own jscpd version differed will see `duplication-*` move on migration; that is the one metric to re-freeze knowingly.
- **Hooks read the config lazily** from the built `dist/config/`, so the global secrets hook (wired from `~/.agents/hooks`) never depends on it to load. A hook never crashes on a broken or absent config: the universal rules (secrets, force push) run first, and the config falls back to the defaults with a note on stderr - a crash would be fail-open for a guard.
- **The root is the git top-level, not a config field.** Every consumer runs the gate from its repo root; the old `ROOT = resolve(import.meta.dirname, '../..')` only existed because the script lived two folders down.
- **`complexity.mts` and `size.mts` were ported from project-a's copy** (review of 2026-09-02: `?.`, default parameters, field initialisers, static blocks, `.mts`/`.cts` in the window), which had evolved past the toolbox - issue #1's drift in the other direction. Consumers behind that copy will see `cc-over-limit`, `files-over-limit` and `explicit-any` move on migration, in the direction of measuring more; run from this checkout against project-a's current tree, the library's metric table equals the one project-a's own copy prints (the pilot itself is still step 4 of the migration). Other collectors there (`compare`, `cycles`, `locale`, `report`) are also ahead and are a follow-up.

## Decided (2026-09-15)

1. One package, `@lukiita/toolbox`: one version to reason about.
2. `toolbox.config.ts` with `defineToolboxConfig` for autocomplete; `.mjs` accepted.
3. Git dependency first (`github:Lukiita/toolbox#v1.0.0`); a registry later is one line per project.
