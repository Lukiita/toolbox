# Archon workflows — project-a

> **Inherited from `project-b`,** together with the graph itself. The reasoning
> carries over; the data does not. No cost figure, run id, PR number or pilot
> date below was measured in this repository, and references to `src/lib/`,
> `pnpm test`, the `db-change` skill or pgTAP describe that project's rules —
> this repo's rules live in `AGENTS.md` at the root, and the files Archon
> actually executes were adapted on import. Supabase is not wired here yet, so
> the pgTAP step is absent from `scripts/repo-gate.sh` (the note in that file
> says how to put it back).

Custom [Archon CLI](https://github.com/coleam00/Archon) workflows for this repo. Files under `.archon/workflows/` and `.archon/commands/` are discovered automatically and override bundled defaults by name.

> **Pilot, 2026-08-04.** This branch carries **one** workflow. Six others were written here and removed before ever running end to end — keeping untested YAML discoverable by Archon advertises support that does not exist. They come back one per PR, each answering "does this reuse the proven line correctly?". Recovery and order: the **Backlog** section at the bottom.

> **Renamed on 2026-08-04: `project-b-*` → `tlc-*`.** These workflows run the `tlc-spec-driven` method headless; they were never about shops. The old prefix named the client, which made no sense the moment the flow was meant to travel to another project. Every reference in this repo — including the historical entries in `docs/plano-fluxo-tlc.md` — uses the new names, so a search finds the file that exists. Only the **domain** keeps `project-b`: `project-b` (this repo), `project-b-schedule` (a capability), `project-b-avatar` (a component).

> This file is the **catalog**: which workflow to reach for. To understand what happens *inside* one — node by node, and why — read **[WORKFLOWS.md](WORKFLOWS.md)**.

Organizing principle: **spec-first**. Scope decisions are made interactively in a Claude Code session (tlc-spec-driven: Specify → Design → Tasks); Archon executes headless what was already decided. Workflow nodes cannot ask questions mid-run — the only human touchpoint is an approval gate between nodes. A second structural guarantee: **author ≠ verifier** — implementation and verification run as separate nodes with fresh context, so the verifier never inherits the implementer's assumptions. A third: **nothing mutates after the stamp** — external review and its fixes run *before* the verifier, so `validation.md` always describes exactly the code that reaches the PR. That is bought with ordering, not with a reconciliation pass.

## Workflows

### `tlc-apply-feature` — *the feature spec is ready, execute it*

The spec-first counterpart that does not depend on an issue (replaces the retired `tlc-apply-spec`, which was OpenSpec-bound). Verifies the feature exists in the worktree (`.specs/features/<slug>/spec.md`, fails fast otherwise), implements following the tlc execution contract (tests derived from the ACs, atomic commit per task), runs the external review chain, and only then dispatches the **independent Verifier as a separate fresh node** — spec-anchored evidence-or-zero, capability regression check against `.specs/capabilities/`, discrimination sensor, persisted `validation.md`. One bounded fix→re-verify round; a deterministic gate greps the report's verdict; on PASS the `capability-sync` skill folds the verified behavior into `.specs/capabilities/` and a `capability-gate` re-runs `capabilities.py check` before the PR — the sync node's word is not the evidence. `--from` is required in practice — without it the worktree starts from main and cannot see your spec.

```bash
archon workflow run tlc-apply-feature --from feat/my-spec --branch my-slug "apply feature my-slug"
```

## Commands and scripts — the shared middle

Three workflows used to open a PR and each carried a copy of the same review/verification chain; the extraction into single-owner pieces survives them. What is still here is what `tlc-apply-feature` calls:

| Piece | File |
|---|---|
| Repo gate — lint + typecheck + tests, plus pgTAP when the diff touches `supabase/migrations/` or `supabase/tests/` | `scripts/repo-gate.sh` |
| Verdict gate — greps the **persisted** report for `**Overall**: ✅ Ready` | `scripts/verdict-gate.sh <report> <tlc\|fix>` |
| ADR input fingerprint — tells a stale marker from a freshly detected conflict | `scripts/adr-inputs-fingerprint.sh` |
| PR close-out — re-targets the base, prints the PR and the handoff | `scripts/pr-finalize.sh` |
| Review + triage, read-only, via the `code-review` skill | `commands/tlc-review.md` |
| Applies the must-fix items the review flagged | `commands/tlc-fix-review.md` |
| Review + fix in a single node (retired 2026-08-06, kept for revert) | `commands/tlc-review-fix.md` |
| tlc Verifier contract — evidence-or-zero, capability regression, discrimination sensor, writes `validation.md` | `commands/tlc-verify-feature.md` |
| Capability contract sync | `commands/tlc-sync-capabilities.md` |

`verdict-gate.sh` keeps its `fix` mode (`VERDICT: PASS`) even though nothing calls it today — it is two lines and the flows that used it come back.

`tlc-apply-feature` keeps its own `fix-gaps`/`re-verify` inline: they anchor on the spec, write a `validation.md` versioned on the branch and check capability regression — a different contract, not the same node renamed. Rationale in `WORKFLOWS.md`.

**`command:` takes no arguments** — Archon reads the whole string as the file name. A node that needs data passes it through a file the command reads.

## Decision cheat sheet

| Situation | Path |
|---|---|
| Big idea / new business rule | tlc Specify/Design/Tasks interactively → `tlc-apply-feature` |
| Database-only change | the `db-change` skill, in a session |
| Bug, issue, PR comments, meeting notes | interactively, for now — see **Backlog** |
| Loose question / debugging | `archon chat` (falls back to the bundled `archon-assist`) |

## Operational notes

- **Branching**: `--branch X` always creates `archon/task-<sanitized X>` from main. To make an existing branch's content (e.g. a committed spec) visible, pass `--from <branch>`. Worktrees hang off the local repo — local commits are enough, no push needed before running.
- **Resuming**: use **`archon workflow resume <run-id>`** (id from `archon workflow runs`). It skips already-completed nodes and restarts at the one that failed, inside the same worktree. It is **not listed in `archon --help`**, which is why it went unused for so long. Do **not** retry with `archon workflow run … --branch`: that opens a brand-new run and re-pays the whole pipeline. The `--resume` *flag* is a different thing and is broken for worktree runs — it matches by cwd, not by run id (Archon issue [#2127](https://github.com/coleam00/Archon/issues/2127), still reproducing on v0.6.0). Measured, with the table of what does and does not resume, in `WORKFLOWS.md`. `archon continue <branch>` reopens an existing worktree with prior context.
- **Stuck runs**: a run left in `running` with no live process blocks the next one and never shows up as a failure. `archon workflow status` to spot it, `archon workflow abandon <run-id>` to clear it — `cancel` is not a CLI subcommand.
- **Token**: the PR node needs the `gh` token to have **Contents: Read** and **Pull requests: Read and write** on this repo (**Issues: Read and write** too, once the issue flows come back). Pushes go over SSH and are unaffected.
- **Validation**: after editing anything here, run `archon validate workflows` and `archon validate commands`. A pre-existing error on the bundled `archon-smart-pr-review` (missing `.archon/mcp/ntfy.json`) is expected noise, not ours.

## Backlog — removed from this branch on 2026-08-04

All of it lives in commit `fcb120b`; restore a file with
`git checkout fcb120b -- <path>`. Order of return, each in its own PR:

| # | what | why it waits |
|---|---|---|
| 1 | **PR findings** (`tlc-pr-findings.yaml`, `collect-pr-findings.sh`, `pr-review-state.sh`, `tlc-process-findings.md`, `tlc-publish-findings.md`) | comes back as a **skill**, not a workflow — the job turned interactive when the automatic loop died. The collector and the triage contract are the durable parts; the DAG is not |
| 2 | **`tlc-fix-bug`** | derives the proven chain, changing only the entry point |
| 3 | **`archon-fix-github-issue`** (our override) | should become a router to feature/bug, not a third copy of the chain. **While removed, that name resolves to Archon's bundled workflow**, which knows nothing about this repo — do not run it expecting ours |
| 4 | **`tlc-db-change`** | may not need to exist: the `db-change` skill already covers it interactively, and `tlc-apply-feature` calls the same skill |
| 5 | **`tlc-pr-review`** | only if manual PRs justify a review beyond `review` + `fix` + CodeRabbit |
| 6 | **`tlc-pauta-to-issues`** | independent, lowest priority |

Also gone: `tlc-validate.md` (already orphaned), `tlc-fix-gaps.md`, `tlc-re-verify.md`, `tlc-verify-change.md` — used only by the removed flows.

**Findings already paid for on item 1.** CodeRabbit reviewed the collector and the
triage contract on PR #39 before they left the branch. The code is in `fcb120b`, but
the reading is here, so the skill does not re-import defects that were already found:

| severity | where | what |
|---|---|---|
| 🔴 | `collect-pr-findings.sh` | **zero-header case kills the script.** When no review body carries `Outside diff range comments (N)`, `grep` exits 1 and `pipefail` takes the script down before it can emit `NENHUM` — the empty case is the common one |
| 🟠 | `tlc-publish-findings.md` | **command injection (CWE-78).** The reply text is interpolated into a shell string, and `$()`/backticks in it execute. Findings are an untrusted channel: pass the body as *data* (`--raw-field`, or JSON via `--input`) |
| 🟠 | `tlc-process-findings.md` | fields taken from findings (`motivo`, `arquivo:linha`) reach a Markdown table unescaped — `\|`, newlines and HTML can forge rows in the ledger. Normalize to one line and escape |
| 🟠 | both scripts | `gh api … \|\| true` turns an **API failure into a valid verdict** (`LIMPO`/`AGUARDANDO`, or zero findings). Fail closed, or return indeterminate |
| 🟠 | `collect-pr-findings.sh` | **not paginated**: `reviewThreads(first: 100)` and the nested `comments`. A PR past those bounds silently drops findings |
| 🟠 | `collect-pr-findings.sh` | pruning that fails must **keep the original artifact**; a collector that fails open is worse than one that crashes |
| 🟠 | `collect-pr-findings.sh` | channel 4 (threads the reviewer closed) is excluded from the `HA_ACHADOS` verdict, so a defect living only there never reaches triage. Compare ids against the persisted ledger — total count does not work, old entries stay in the collection |
| 🟠 | `tlc-publish-findings.md` | replies are published for every row with `reply_to`, including `JÁ TRATADO` rows. Those stay in the table to prove coverage; they must not be answered again |
| 🟠 | `tlc-publish-findings.md` | empty `ledger_id` still calls `gh api`. Treat it as an empty ledger and publish as `rodada=1` |
| 🟡 | `pr-review-state.sh` | `HEAD_SHA` is captured *before* the review/thread/ledger requests — a push mid-run makes the verdict describe the previous commit. Re-read `headRefOid` next to the verdict, or snapshot it explicitly |
| 🟡 | `pr-review-state.sh` | the publisher's login is the `gh` session identity, not necessarily the PR author — needs its own variable, or a bot identity breaks the author filters |
| 🟡 | `pr-review-state.sh` | the open-thread predicate reads the last of the *first* 50 comments instead of the true last one |
| 🟡 | `pr-review-state.sh` | the section-3 findings are not persisted, so `LIMPO` can be emitted without full triage coverage |
| 🟡 | `pr-review-state.sh` | when the fallback JSON carries only `veredito`, field extraction returns nonzero under `set -euo pipefail` and the `desfecho` step dies before printing the interrupted-state guidance |
| 🟡 | `tlc-process-findings.md` | a reviewer-resolved thread we never answered is classified `REABERTO`; it was never treated, so it is `NOVO` (or needs its own status) |
| 🟡 | `tlc-publish-findings.md` | the audit line is dropped when the round has nothing else to publish, losing the only durable record of that count |

**During the pilot**, treating CodeRabbit findings is manual and DB changes go through the `db-change` skill in a session.
