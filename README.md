# toolbox

My personal development environment, versioned. This repo is the **single source**: the machine consumes it through symlinks, and any drift shows up in `git status` instead of hiding in copies.

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
| `~/.claude/CLAUDE.md` | `claude/CLAUDE.md` | symlink (a one-line pointer to AGENTS.md) |
| `~/.claude/settings.json` | `claude/settings.json` | **copy** — Claude Code rewrites this file on its own; a symlink would be destroyed by the app's first atomic write. Divergence becomes a warning with a diff, never an overwrite. |

Whatever existed before becomes a `*.pre-toolbox.<timestamp>` backup next to it.

## Structure

```
skills/       8 global skills (available in any session, any project)
agents/       AGENTS.md — global instructions for every agent (single source)
claude/       CLAUDE.md pointer + shareable settings.json
archon/       canonical source of the Archon flow (headless tlc) — imported, not linked
hooks/        provider-neutral agent guards (secrets/push deny + missing-tests warn) — imported per project
quality-gate/ ratchet engine template (frozen baseline, 10 metrics, per-file coverage) — imported per project
install.sh
```

## Skills

| skill | role |
|---|---|
| `grilling` | relentless interview to stress-test a decision |
| `grill-with-docs` | grilling + domain-modeling (produces glossary and ADRs along the way) |
| `domain-modeling` | ubiquitous language (`CONTEXT.md`) + ADRs (`docs/adr/`) |
| `tlc-spec-driven` | Specify → Design → Tasks → Execute with an independent Verifier (`.specs/`) |
| `ddd-tactical` | the house tactical-DDD style as templates: aggregates, VOs, typed ids, repositories+mappers, lightweight CQRS (ships its own `evals/`) |
| `capability-sync` | living behavioral contract (`.specs/capabilities/`) |
| `code-review` | pre-PR diff review, two lenses + triage |
| `pr-review-triage` | triage of open-PR review comments (CodeRabbit etc.) |

Not carried here: `skill-creator` — it is Anthropic's official skill, unpatched by us; vendoring it would be drift without value. Install it from the official channel when needed.

**How they talk to each other** (harmonized 2026-08-17): tlc specs and designs use the `CONTEXT.md` terms; designs conform to accepted ADRs in `docs/adr/`; a `STATE.md` `AD-NNN` decision that passes the three-part ADR test becomes an ADR with the AD pointing at it; and script commands resolve through the skill's own directory (`<skill-dir>`), with cross-skill references on the canonical `~/.agents/skills/` prefix that install.sh guarantees.

## Third-party skills — the upstream contract

`tlc-spec-driven` has a live upstream ([tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills), CC-BY-4.0) and `domain-modeling` came from skills.sh. To avoid silent divergence without losing upstream improvements:

- the pristine upstream version lives on a **`vendor/<skill>`** branch (never edited);
- the local delta is documented in the skill's **`UPSTREAM.md`** — every patch with its why;
- **updating** = commit the new version on the vendor branch + `git merge` into main: the 3-way merge lets local patches survive or conflict in the open, never vanish;
- a generic local patch becomes an upstream issue/PR — good delta is shrinking delta.

The step-by-step procedure lives in `skills/tlc-spec-driven/UPSTREAM.md`.

## Global vs per-project

Skills here are **global**. A project that needs them at headless runtime (e.g. Archon worktrees, CI) carries a **copy** in the repo's `.agents/skills/`, imported from here — and inside the project, the pattern is `.claude/skills` and `.cursor/skills` as relative symlinks to `.agents/skills/` (as Project A does). The toolbox is the arbiter: an improvement made in a copy comes back here.

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
