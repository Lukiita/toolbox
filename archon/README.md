# Archon workflows — the headless tlc flow

Custom [Archon CLI](https://github.com/coleam00/Archon) workflows that run the `tlc-spec-driven` method without a human in the loop. Files under `.archon/workflows/` and `.archon/commands/` are discovered automatically and override bundled defaults by name.

This directory is the **template**. The flow is maintained here; a project carries a copy adapted to its own gate and rules (import steps in the [toolbox README](../README.md#archon--importing-into-a-project)). What a project *measures* — costs, run ids, PR numbers, the backlog of flows it has not brought back yet — lives in that project's `.archon/README.md`, never here: a template that carries one project's history sends it to the next.

> This file is the **catalog**: which workflow to reach for. To understand what happens *inside* one — node by node, and why — read **[WORKFLOWS.md](WORKFLOWS.md)**.

Organizing principle: **spec-first**. Scope decisions are made interactively in a Claude Code session (tlc-spec-driven: Specify → Design → Tasks); Archon executes headless what was already decided. Workflow nodes cannot ask questions mid-run — the only human touchpoint is an approval gate between nodes. A second structural guarantee: **author ≠ verifier** — implementation and verification run as separate nodes with fresh context, so the verifier never inherits the implementer's assumptions. A third: **nothing mutates after the stamp** — external review and its fixes run *before* the verifier, so `validation.md` always describes exactly the code that reaches the PR. That is bought with ordering, not with a reconciliation pass.

## Workflows

### `tlc-apply-feature` — *the feature spec is ready, execute it*

Verifies the feature exists in the worktree (`.specs/features/<slug>/spec.md`, fails fast otherwise), implements following the tlc execution contract (tests derived from the ACs, atomic commit per task), runs the review chain, and only then dispatches the **independent Verifier as a separate fresh node** — spec-anchored evidence-or-zero, capability regression check against `.specs/capabilities/`, discrimination sensor, persisted `validation.md`. One bounded fix→re-verify round; a deterministic gate greps the report's verdict; on PASS the `capability-sync` skill folds the verified behavior into `.specs/capabilities/` and a `capability-gate` re-runs `capabilities.py check` before the PR — the sync node's word is not the evidence. `--from` is required in practice — without it the worktree starts from main and cannot see your spec.

```bash
archon workflow run tlc-apply-feature --from feat/my-spec --branch my-slug "apply feature my-slug"
```

## Commands and scripts — the shared middle

Each piece has one owner, so a second workflow reuses the proven chain instead of copying it:

| Piece | File |
|---|---|
| Repo gate — lint + typecheck + tests, plus pgTAP when the diff touches `supabase/migrations/` or `supabase/tests/` | `scripts/repo-gate.sh` |
| Verdict gate — greps the **persisted** report for `**Overall**: ✅ Ready` | `scripts/verdict-gate.sh <report> <tlc\|fix>` |
| ADR input fingerprint — tells a stale marker from a freshly detected conflict | `scripts/adr-inputs-fingerprint.sh` |
| PR close-out — re-targets the base, prints the PR and the handoff | `scripts/pr-finalize.sh` |
| Review + triage, read-only, via the `code-review` skill | `commands/tlc-review.md` |
| Applies the must-fix items the review flagged | `commands/tlc-fix-review.md` |
| tlc Verifier contract — evidence-or-zero, capability regression, discrimination sensor, writes `validation.md` | `commands/tlc-verify-feature.md` |
| Capability contract sync | `commands/tlc-sync-capabilities.md` |

`verdict-gate.sh` keeps its `fix` mode (`VERDICT: PASS`) even though nothing calls it today — it is two lines and the bug-fix flow that uses it is the next one to derive from this chain.

`tlc-apply-feature` keeps its own `fix-gaps`/`re-verify` inline: they anchor on the spec, write a `validation.md` versioned on the branch and check capability regression — a different contract, not the same node renamed. Rationale in `WORKFLOWS.md`.

Review and fix are **separate nodes** on purpose: the reviewer can then run on another model family (`config.yaml`), so `author ≠ reviewer` means different training and different blind spots, not just a fresh context. The single `review-fix` node that preceded the split is in git history if the four nodes ever need to collapse back into one.

**`command:` takes no arguments** — Archon reads the whole string as the file name. A node that needs data passes it through a file the command reads.

## Adaptation points (review on import)

- `scripts/repo-gate.sh` — the repo's lint/typecheck/test gate. The pgTAP step is conditional on `supabase/` paths; drop or replace it for another database.
- `config.yaml` — model aliases per role. The reviewer alias is where a second model family enters.
- `commands/*.md` — they cite conventions of the repo they run in (`AGENTS.md`, `pnpm gate`, the language policy); read each once against the target repo.
- The skills the worktree needs inside the repo: `tlc-spec-driven`, `capability-sync`, `code-review` under `.agents/skills/`.
- After any edit here: `archon validate workflows && archon validate commands`.

## Operational notes

- **Branching**: `--branch X` always creates `archon/task-<sanitized X>` from main. To make an existing branch's content (e.g. a committed spec) visible, pass `--from <branch>`. Worktrees hang off the local repo — local commits are enough, no push needed before running.
- **Resuming**: use **`archon workflow resume <run-id>`** (id from `archon workflow runs`). It skips already-completed nodes and restarts at the one that failed, inside the same worktree. It is **not listed in `archon --help`**. Do **not** retry with `archon workflow run … --branch`: that opens a brand-new run and re-pays the whole pipeline. The `--resume` *flag* is a different thing and is broken for worktree runs — it matches by cwd, not by run id (Archon issue [#2127](https://github.com/coleam00/Archon/issues/2127), still reproducing on v0.6.0). The table of what does and does not resume is in `WORKFLOWS.md`. `archon continue <branch>` reopens an existing worktree with prior context.
- **Stuck runs**: a run left in `running` with no live process blocks the next one and never shows up as a failure. `archon workflow status` to spot it, `archon workflow abandon <run-id>` to clear it — `cancel` is not a CLI subcommand.
- **Token**: the PR node needs the `gh` token to have **Contents: Read** and **Pull requests: Read and write** on the repo (**Issues: Read and write** as well for any flow that opens issues). Pushes go over SSH and are unaffected.
- **Validation**: after editing anything here, run `archon validate workflows` and `archon validate commands`. A pre-existing error on the bundled `archon-smart-pr-review` (missing `.archon/mcp/ntfy.json`) is expected noise, not ours.
