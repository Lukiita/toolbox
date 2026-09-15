# toolbox

My personal development environment, versioned. This repo is the **single source**: the machine consumes it through symlinks, and projects consume it as a **versioned package** (`@lukiita/toolbox`, ADR-0001) — any drift shows up in `git status` or in a version number, never hidden in copies.

The pattern came from Project A's `.agents/skills/`, which learned the hard way that copy-per-provider drifts — when the skills were rescued into this repo, the only difference between the `tlc-spec-driven` copies in project-b and Project A was the script path prefix.

## Installing on a new machine

```bash
git clone git@github.com:Lukiita/toolbox.git
cd toolbox && ./install.sh
```

Idempotent: running it again only confirms the state. What it links:

| target | source | how |
|---|---|---|
| `~/.claude/skills` | `skills/` | symlink |
| `~/.agents/skills` | `skills/` | symlink (the canonical path skills reference) |
| `~/.agents/AGENTS.md` | `agents/AGENTS.md` | symlink (agent-agnostic global instructions) |
| `~/.codex/AGENTS.md` | `agents/AGENTS.md` | symlink |
| `~/.codex/skills/<skill>` | `skills/<skill>` | one symlink **per skill** — Codex keeps its own `.system/` inside that directory, so the directory itself cannot be a link; dangling links are pruned |
| `~/.agents/hooks` | `hooks/` | symlink (the global secrets guard is wired from here) |
| `~/.agents/katas` | `katas/` | symlink (`architecture-kata` practice output — never a stray `katas/` inside a client repo) |
| `~/.claude/agents` | `claude/agents/` | symlink (Claude Code subagent definitions) |
| `~/.claude/CLAUDE.md` | `claude/CLAUDE.md` | symlink (a one-line pointer to AGENTS.md) |
| `~/.claude/settings.json` | `claude/settings.json` | **copy** — Claude Code rewrites this file on its own; a symlink would be destroyed by the app's first atomic write. Divergence becomes a warning with a diff, never an overwrite. |

Whatever existed before becomes a `*.pre-toolbox.<timestamp>` backup next to it.

## Using it in a project (the library)

Projects used to copy `skills/`, `hooks/` and `quality-gate/` and adapt them by hand; the copies drifted (issues #1 and #2 were fixes born in a copy). Now a project depends on the package and configures it:

```bash
pnpm add -D github:Lukiita/toolbox#v1.0.0     # a tag is a version (v1.0.0 = the first release); no registry, no build step
pnpm exec toolbox install                      # links every shipped skill into .agents/skills/
cp node_modules/@lukiita/toolbox/toolbox.config.example.ts toolbox.config.ts
```

- **Skills** arrive as symlinks in `.agents/skills/` (Claude, Codex and Cursor all read it); the project's own skills in that folder are never touched. Add `"postinstall": "toolbox install"` to the project's scripts: `pnpm install` on a fresh clone links them (verified with pnpm 12); `pnpm add` does not run the project's own postinstall, hence the explicit `pnpm exec toolbox install` once after adding.
- **Quality ratchet**: `"quality": "toolbox quality"` in the scripts; the rest of the setup (baseline, CI, pre-push hook) is in `templates/quality-gate/README.md`.
- **Hooks**: wired from `node_modules/@lukiita/toolbox/hooks/` — see `hooks/README.md`.
- **Config**: one file, `toolbox.config.ts`, holds every value a project used to edit inside a copied file (source window, feature slot, limits, alias prefixes, base branch, protected branches). Empty config = canonical setup. The code is never edited in a project.

Updating a project is `pnpm update @lukiita/toolbox`. Publishing is a build and a tag: `pnpm build:check && git tag v1.1.0 && git push && git push --tags` (the pre-commit already keeps `dist/` in sync when `src/` changes). Breaking changes bump the major; a project chooses when to move.

Migration of an existing copy, one project at a time: `./toolbox-diff.sh <project>` lists the adaptations — each one becomes a config field — then delete `scripts/quality/`, `tools/agent-hooks/` and the toolbox-owned skills, and run `pnpm quality --update-baseline` once: the numbers must not move (a moved number means the config is wrong, not the baseline). Two known exceptions, both in the direction of measuring more: `duplication-*` when the project's jscpd version differs from the package's pinned one, and `cc-over-limit`/`files-over-limit`/`explicit-any` for a copy older than project-a's 2026-09-02 collectors, which the package now carries.

## Developing the toolbox itself

```bash
pnpm install && pnpm test && pnpm typecheck && pnpm build && pnpm quality
```

`src/` is TypeScript (`.mts`, tests beside each module), built to `dist/` — and **`dist/` is committed**. Two facts force that: Node refuses to strip types from files under `node_modules`, so `.mts` cannot ship as is; and pnpm 12 refuses a git dependency's build script unless the consumer allowlists it with the commit sha, which breaks on every bump. So nothing runs on install: the tag carries the build. `.githooks/pre-commit` refuses a commit that would carry `src/` and `dist/` out of sync — it rebuilds, then fails if `src/` has unstaged changes, if the staged `dist/` differs from the build, or if `dist/` changed but is not in the commit — and tells what to run (`./install.sh` sets `core.hooksPath`); `pnpm build` cleans `dist/` first, so a deleted source drops its orphan; `pnpm build:check` is the release gate — it fails unless `dist/` equals HEAD, run it before a tag. `hooks/` is plain `.mjs`. `skills/` and `templates/` ship as files.

## Structure

```
skills/       15 global skills (available in any session, any project)
agents/       AGENTS.md — global instructions for every agent (single source)
              preferencias-conta.md — source for the text pasted into claude.ai's web settings
claude/       CLAUDE.md pointer + shareable settings.json
archon/       canonical source of the Archon flow (headless tlc) — imported, not linked
hooks/        provider-neutral agent guards (secrets/push deny + missing-tests warn) — shipped in the package, config-driven
src/          the package's TypeScript: config/, quality-gate/ (the ratchet, 10 metrics), pre-push/, install/, cli/
templates/    quality-gate examples a project copies once (baseline, CI, vitest config, pre-push one-liner, dependency-cruiser)
docs/adr/     architectural decisions (ADR-0001: the toolbox as a library)
katas/        architecture-kata practice output — one folder per kata
install.sh
toolbox-diff.sh   drift report for a project's copies — the migration checklist while copies still exist
system-mind-export.sh  flattens the study vault into one file for the claude.ai project Context
```

## Skills

| skill | role |
|---|---|
| `grilling` | relentless interview to stress-test a decision |
| `grill-with-docs` | grilling + domain-modeling (produces glossary and ADRs along the way) |
| `domain-modeling` | ubiquitous language (`CONTEXT.md`) + ADRs (`docs/adr/`) |
| `tlc-spec-driven` | Specify → Design → Tasks → Execute with an independent Verifier (`.specs/`) |
| `ddd-tactical` | the house tactical-DDD style as templates: aggregates, VOs, typed ids, repositories+mappers, lightweight CQRS (ships its own `evals/`) |
| `sql-quality` | SQL cost proportional to output: query shape (fan-out, paginate-first), ORM/builder landmines, index+migration safety, EXPLAIN diagnosis (ships its own `evals/`) |
| `architecture-kata` | socratic architecture coach: generated katas with a hidden gabarito + co-designing real greenfields — think-first, verdict only in the review (ships its own `evals/`) |
| `capability-sync` | living behavioral contract (`.specs/capabilities/`) |
| `code-review` | pre-PR diff review: bug lens ×2 (independent), project rules + smell baseline, intent-vs-commits lens outside tlc, triage at ≥80 |
| `pr-review-triage` | triage of open-PR review comments (CodeRabbit etc.) |
| `codebase-design` | deep-module vocabulary (module, interface, seam, depth, leverage, locality), the deletion test, design-it-twice — vendored from mattpocock/skills |
| `diagnosing-bugs` | hard-bug discipline: a tight red loop before any theory, minimise, falsifiable hypotheses, regression test at a real seam — vendored from mattpocock/skills |
| `writing-for-agents` | how to write skills and AGENTS.md: context pointers, the two loads, leading words, no-op pruning — vendored from mattpocock/skills |
| `retro` | end-of-session retrospective of the agent's *environment*: what should become a hook, a fitness function, a reviewer rule, a pointer, or a cut (proposes; the proposals land as a note in `~/vault/inbox/`, never as an edit to the toolbox) |
| `setup-pre-commit` | Husky + lint-staged formatter, typecheck and the tlc commit-msg check, each hook proven to bite |

Not carried here: `skill-creator` — it is Anthropic's official skill, unpatched by us; vendoring it would be drift without value. Install it from the official channel when needed.

Evaluated and deferred (2026-08-27, full sweep of mattpocock/skills): `prototype` (throwaway HTML to feel an aggregate's transitions before coding), `wizard` (a bash wizard for the steps only a human can take — secrets, dashboards, CI) and `to-questionnaire` (a questionnaire for the one person who knows the domain answer). Each is self-contained and one command away when its problem shows up: `npx skills@latest add mattpocock/skills --skill=<name>`. Everything else there is either already here (`grilling`, `grill-with-docs`, `domain-modeling`), covered better by tlc (`to-spec`, `to-tickets`, `implement`, `research`), or maintainer tooling for an issue queue a solo dev does not have (`triage`, `wayfinder`).

**How they talk to each other** (harmonized 2026-08-17): tlc specs and designs use the `CONTEXT.md` terms; designs conform to accepted ADRs in `docs/adr/`; a `STATE.md` `AD-NNN` decision that passes the three-part ADR test becomes an ADR with the AD pointing at it; and script commands resolve through the skill's own directory (`<skill-dir>`), with cross-skill references on the canonical `~/.agents/skills/` prefix that install.sh guarantees. Added 2026-08-18: `ddd-tactical`'s read side routes query shape into `sql-quality`, and `code-review`'s bug lens applies `sql-quality`'s review checklist when the diff touches SQL/builders/migrations. Also 2026-08-18: `architecture-kata` borrows `grilling`'s one-question-at-a-time mechanic (recommendation rule inverted — no answers until the review) and writes real-mode glossary/ADRs through `domain-modeling`; tlc-spec-driven's Design phase and Archon stay delivery-mode, never coached.

**The interview method has three homes and one boundary** (mapped 2026-08-18): `grilling` stress-tests a raw idea or plan BEFORE any feature exists — and recommends answers; tlc's Discuss clarifies gray areas INSIDE an already-bounded feature (scope is sacred there); `architecture-kata` coaches greenfield architecture and recommends nothing until its review. The route for a raw idea: `/grill-with-docs` (grilling + glossary/ADRs as they crystallize) → tlc Specify consumes the sharpened plan. Specify itself suggests that route when clarification reveals the WHAT is still contested — a local tlc patch, documented in its `UPSTREAM.md`.

**Added 2026-08-27** (from the mattpocock/skills sweep): `code-review` dropped its cost tuning — the parent now loads the diff at triage, the bug lens runs in two independent agents, and an intent lens (diff vs. commit messages, Matt's *Spec* axis adapted) runs only where no tlc Verifier exists; its Revisor B carries a Fowler smell baseline (`references/smells.md`; a written repo rule overrides it); `arch-review` gained a sixth lens, **depth**, and a survey mode (hot spots from recent commits → deletion test → a rejected candidate becomes an ADR) on `codebase-design`'s vocabulary; tlc got three local patches (test seams named in Design, no file paths in the spec, expand–contract for wide refactors — `UPSTREAM.md` items 8–10); `diagnosing-bugs` hands "no seam for a regression test" to `arch-review`; and `grilling` keeps one-question-at-a-time **on purpose** while upstream moved to rounds — the `architecture-kata` contract and AGENTS.md's "one idea at a time" depend on it (its `UPSTREAM.md` records the fork).

## Third-party skills — the upstream contract

`tlc-spec-driven` has a live upstream ([tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills), CC-BY-4.0); `grilling`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `diagnosing-bugs` and `writing-for-agents` come from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). To avoid silent divergence without losing upstream improvements:

- the pristine upstream version lives on a **`vendor/<skill>`** branch (never edited);
- the local delta is documented in the skill's **`UPSTREAM.md`** — every patch with its why;
- **updating** = commit the new version on the vendor branch + `git merge` into main: the 3-way merge lets local patches survive or conflict in the open, never vanish;
- a generic local patch becomes an upstream issue/PR — good delta is shrinking delta.

One upstream repo, one vendor branch: the six mattpocock skills share **`vendor/mattpocock-skills`** (same source, same commit, synced together — six per-skill branches would mean six merges per sync). Their merge base was recorded on 2026-08-27 with `git merge -s ours` (main's tree untouched, the vendor commit recorded as a parent), so the next sync 3-way merges instead of arriving as unrelated history.

The step-by-step procedure lives in `skills/tlc-spec-driven/UPSTREAM.md`.

`sql-quality` deliberately does NOT follow this contract: it distills github/awesome-copilot's four SQL skills (MIT) instead of vendoring them — the delta was near-total (the shape layer, everything ORM, the house integration), so a vendor branch would only manufacture merge conflicts. The credit lives in the skill's own SKILL.md.

## ai-memory — the episodic recall layer (pilot)

[ai-memory](https://github.com/akitaonrails/ai-memory) (Akita, MIT) runs as a local Docker server with lifecycle hooks: it auto-captures sanitized session observations, consolidates them into a git-versioned wiki at session end, and hands the next agent — including a *different* agent (Codex, Cursor) — a "where you left off" briefing. The boundary that keeps it from becoming a second source of truth:

- **Repo docs stay the curated source of truth** — `CONTEXT.md`, `docs/adr/`, `.specs/capabilities/`, lessons. Decisions live there and only there; ai-memory's bootstrap *indexes* them, never replaces them.
- **The wiki is episodic recall only** — what happened, what was tried and failed, where a session stopped. An agent may *recall* from it; it never *decides* from it against a repo doc.
- Consolidation currently runs in **zero-LLM mode** — see the wiring note below for why. Hooks are installed for Claude Code only during the pilot, and the resulting `settings.json` delta is captured back into `claude/settings.json` here (the toolbox versions that file as a copy — an out-of-band edit would read as drift). Capture `ignore_paths` aligns with the secrets guard.

**How this machine is wired** (pilot, 2026-08-18): server = `akitaonrails/ai-memory:latest` container (name `ai-memory`, published on host loopback :49374, volume `ai-memory-data`) running in **zero-LLM mode** — only `AI_MEMORY_AUTH_TOKEN`, read from `~/.ai-memory-auth-token` (600, required — inside the container the server binds non-loopback and refuses to run auth-less). Capture and FTS5/entity/graph search work; consolidation falls back to rule-based summaries; embeddings disabled. **Why no LLM provider:** the `anthropic-oauth` path (subscription token from `claude setup-token`, stored at `~/.ai-memory-token`) is gated by Anthropic's request classifier — instant `429 rate_limit_error` with the generic message `"Error"`, reproduced 2026-08-18 with a fresh token, a quiet session and window to spare; not a volume limit, and a new token does not help. Revisit when picking a real provider (API key + Haiku ≈ US$0.05/session, `copilot` if a Copilot subscription exists, or local Ollama via `openai-compat`) or when ai-memory ships a workaround. The bootstrap for Project A is sized and ready (26 sources, ~145k tokens, 8 chunks) — run it right after a provider lands. Client = bash wrapper at `~/.local/bin/ai-memory`. The MCP entry lives in `~/.claude.json` — machine-local, carries the bearer token, never versioned. The 9 lifecycle hooks live in `claude/settings.json` here in **secretless form**: the token enters at run time via `$(cat ~/.ai-memory-auth-token)`, never inline (the installer writes it inline; the capture step rewrote it). Known caveat: the shell hook flavor does not enforce capture-policy v1 (`ignore_paths`) client-side — the global secrets guard stays the first line against secret reads.

## Global vs per-project

Skills here are **global**. A project that needs them at headless runtime (e.g. Archon worktrees, CI) carries a **copy** in the repo's `.agents/skills/`, imported from here — and inside the project, the pattern is `.claude/skills` and `.cursor/skills` as relative symlinks to `.agents/skills/` (as Project A does). The toolbox is the arbiter: an improvement made in a copy comes back here.

Copies drift silently — `git status` only sees the symlinked half. **`./toolbox-diff.sh <project-root>`** shows the other half: per component (`.agents/skills/`, `tools/agent-hooks/`, `scripts/quality/`, `.archon/`), every file that differs from the source here, with `+added -deleted` counts and a label — *adaptation point* (the component README says that file is edited on import, so a small diff is expected and a large one is a stale copy wearing an excuse), *only in toolbox*, *only in project*. An unlabeled line is a copy that is simply behind. Run it before piloting a skill in a project and after improving a copy. Measured the day it was written (2026-08-28): Project A's `ddd-tactical` was 284 lines behind, its `code-review` a whole rewrite behind.

## archon/ — importing into a project

The flow is intrinsically per-project (worktrees, repo gate, AGENTS.md), so it is imported, not linked:

1. copy `archon/` to the project's `.archon/`;
2. adapt `scripts/repo-gate.sh` (the repo's lint/typecheck/test gate) and `config.yaml` (model aliases per role);
3. make sure `tlc-spec-driven`, `capability-sync` and `code-review` exist in the project's `.agents/skills/` (copied from here) — Archon worktrees need them inside the repo;
4. review the `commands/` (they cite the source repo's conventions — AGENTS.md, `pnpm gate`, language policy) and run
   `archon validate workflows && archon validate commands`.

`archon/README.md` and `WORKFLOWS.md` document the design and were written to travel between projects.

## Never version here

- `settings.local.json`, `.env*` — secrets and local approvals;
- `~/.claude/projects/`, history, sessions — machine state, not environment;
- permission approvals accumulated from sessions — `claude/settings.json` keeps stable preferences only.

## Next step

Pilot `ddd-tactical` on Project A, modeling the Assinatura+Plano aggregate. (The skill itself is built and benchmarked — A/B eval pass rate 100% with skill vs 70% without, faster and cheaper with it.)
