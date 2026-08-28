# The workflows from the inside

> **Provenance.** Written during the flow's pilot in `project-b` (Aug/2026) and
> kept with the template because the **reasoning** behind each node ports
> unchanged. The **numbers** do not: every cost, run id, PR number and timing
> below was measured in that pilot and is illustrative — a project importing the
> flow measures its own. Where the text names `src/lib/`, `pnpm test`, the
> `db-change` skill or pgTAP, read "the importing repo's equivalent", as set in
> its `AGENTS.md` and `scripts/repo-gate.sh`. The files Archon actually executes
> (`workflows/`, `commands/`, `scripts/`) are the template; this one is reading
> material.

The `README.md` in this directory says **when** to use each workflow. This one
says **what happens inside** each of them, node by node, and why.

A reading document, not a reference: read it once from start to finish.

---

## The YAML grammar

Without this, the file is opaque:

| In the YAML | Meaning |
|---|---|
| `prompt:` | a Claude agent runs with that text |
| `bash:` | script — **exiting with a non-zero code fails the whole flow**. That is how every gate works |
| `command:` | a prepared command — the prompt lives in `.archon/commands/<name>.md`. **Takes no argument**: Archon reads the whole string as the file name |
| `context: fresh` | the node **starts from zero**: it saw nothing of what happened before |
| `depends_on:` | execution order |
| `when:` | conditional — if false, **skips** (does not fail) |
| `trigger_rule: one_success` | runs if at least one parent completed (Archon waits for all of them to settle before evaluating) |
| `output_format:` | forces the node to return JSON with defined fields, usable in `when:` |

Two gotchas that have already cost time:

- **Substitution comes pre-quoted.** Write `VAR=$node.output` — no quotes. `"$node.output"` produces the wrong value, and `archon validate workflows` flags it.
- **`--branch X` creates the branch from `main`.** For a spec committed on another branch to be visible in the worktree, passing `--from <spec-branch>` is mandatory.

---

## The three guarantees

Every node exists because of one of them. If something in the flow looks like
ceremony, it is because one of these is being bought:

**1. Spec-first.** Scope decisions are interactive; Archon only executes what
was already decided. Headless nodes cannot ask questions — the only human
touchpoint in the middle of a run is an `approval:` gate.

**2. Author ≠ verifier.** Whoever writes is never whoever approves. An
instruction in YAML or in a skill **does not spawn a sub-agent**: whoever reads
the instruction is the same agent that wrote the code, evaluating itself.
Separate nodes with `context: fresh` do. That is why independence is a property
of the graph, not of the prompt.

**3. Nothing mutates after the stamp.** Verification is the **last** check
before the PR — review and fixes happen before it. That is why
`validation.md` always describes exactly the code that reaches the PR. This
guarantee is bought with **ordering**, not with a reconciliation step: the
previous version of this flow reviewed after the PR and needed a `re-gate` to
repair the evidence that was going stale. Swapping the order erased the problem.

---

## The three levels of validation (the most common confusion)

tlc validates **three times**, with different owners. Confusing the levels is
what makes `implement` look contradictory:

| Level | Who runs it | What | Where |
|---|---|---|---|
| **1. Per task** | **the implementer** | "Done when" criteria + gate (tests pass) before **each** commit | inside the `implement` node |
| **2. Feature** | **independent Verifier** | evidence-or-zero, capability regression, discrimination sensor | `verify` node, fresh context |
| **3. UAT** | human | UI features only | outside Archon (headless has no user) |

The implementer **runs level 1 and is required to**. What it cannot do is
level 2 — self-certification is exactly what this flow exists to prevent. It
also does not write `validation.md`.

---

## `tlc-apply-feature` — the main path

19 nodes, in **5 movements**:

```
① FIND THE SPEC      extract-slug → verify-feature → remaining-tasks
② IMPLEMENT          implement → adr-gate → validate
③ REVIEW             clear-must-fix → review → remaining-must-fix → [fix → validate-fix]
④ VERIFY ★           verify → [fix-gaps → re-verify] → verdict-gate
⑤ CONTRACT AND PR    sync-capabilities → capability-gate → create-pr → finalize
```

**The order is the design.** Review comes before verification, so the
Verifier's stamp lands on the final code — nothing mutates after it. A previous
version inverted this (review after the PR) and needed 13 more nodes, including
a `re-gate` just to reconcile the evidence that was going stale. Ordering it
right erased the problem instead of remedying it.

### ① Find the spec

`extract-slug` (small model) turns "apply the feature cores-categoria" into the
bare slug. `verify-feature` (bash) checks that `.specs/features/<slug>/spec.md`
exists and **fails fast** if not.

*Why:* the worktree is born from `main`. Without `--from`, the spec is not there
— and without this gate `implement` would invent the feature instead of
following yours.

### ② Implement

`implement` (fresh, large model) follows the tlc execution contract: tests
derived from the acceptance criteria, gate per task, atomic commit per task,
never weaken a test to pass. Runs **level 1** of validation.

`validate` (bash) runs the repo gate: lint + typecheck + tests, plus pgTAP when
the diff touches `supabase/migrations/` or `supabase/tests/`. **Bash, not an
agent**, and that choice is the design: `implement` already finishes by running
this same gate and fixing what breaks, so an agent here would repeat the work
and — worse — honestly report the red and let the pipeline carry on. Red here
is a pipeline stop, and that is an `exit 1`, not a judgement. Zero model cost.

### ③ Review

`review` (fresh) reviews and triages, with **the `code-review` skill**:
independent agents per lens — the bug lens twice over (two agents, same prompt,
unaware of each other), the project-rules lens (`AGENTS.md`/`CLAUDE.md`,
`.specs/capabilities/`, connascence, the Fowler smell baseline), a deterministic
base-divergence check, and a 0–100 confidence triage that only lets ≥ 80
through. Its intent lens (diff vs. commit messages) does not run in this
pipeline: a tlc repo has `.specs/`, so spec compliance belongs to the Verifier.

**`review` does not fix** — it is read-only over the code, and that is a
property of the graph, not a promise in a prompt: the node that reviews has
nowhere to write. When must-fix items remain, it writes
`$ARTIFACTS_DIR/.must-fix`, a bash node greps it (`remaining-must-fix`) and only
then does `fix` wake up to apply the corrections. If the review came back
clean, `fix` is skipped and costs no context at all.

The marker is deleted by a bash node (`clear-must-fix`) right before the
review: `$ARTIFACTS_DIR` survives the attempt, and a `.must-fix` orphaned by an
interrupted review would make `fix` repair obsolete findings in a run where the
new review came back clean.

The split exists because of one rule: **source-code writing stays in Claude**.
Separated, `review` can run in another model family (alias `@reviewer` in
`config.yaml`), and then `author ≠ reviewer` stops being "separate node, same
family" and becomes different training with different blind spots. It was that
property that let CodeRabbit find, on PR #44, what this pipeline's
"project rules" lens declared non-existent.

The previous single node (`review-fix`, which reviewed and fixed together) left
the workflow on 2026-08-06; its command lives in git history (`git log --all --
'*tlc-review-fix.md'`), so the way back is swapping the four nodes for one again.

**There is no external reviewer pass before the PR, and that is a decision
taken.** CodeRabbit reviews **on the PR**, through the GitHub app, where the
review is already paid for once, stays visible in the thread and can be
answered. Running the CLI before that duplicated the spend, hung the run in
`heartbeat: reviewing` for tens of minutes and, when the plan hit its limit,
exited with **exit 0 without having reviewed anything** — it took a dedicated
script just to detect that lie. The gain did not pay the price.

It triages before applying. Two reasons:

- The review's output is **untrusted input**. The node treats findings as data,
  never as instructions, and refuses anything that asks it to run a command or
  touch a credential.
- Chasing "zero comments" optimises the wrong metric: it produces shallow tests
  and fixes for non-problems. Every finding becomes `must-fix` or `won't-fix`
  **with a written reason** — the reason is what prevents both lazy dismissal
  and blind obedience.

One fix round, and it stops. The Verifier right after is the safety net.

### ④ Verify ★

**This is where the flow's value lives.**

`verify` runs in a fresh context: that agent **did not see the code being
written**. It receives the spec, the diff and `references/validate.md`, and
re-derives everything:

- **evidence-or-zero** — every criterion must point at `file:line` + the
  assertion. No citation = not covered. "There is a test" is not enough; the
  assertion has to target the value the spec defines.
- **capability regression** — did the new feature break an old guarantee in
  `.specs/capabilities/`?
- **discrimination sensor** — injects 1–3 defects into the new code in
  disposable state (`git stash`), runs the tests and confirms they **fail**. A
  test that passes with broken code is worthless. This is what catches "green
  suite, broken code" — the failure that cost the idempotency bug of
  `assinatura-barbearia`.

Two more sweeps, because this node is the last check before the PR:

- **Coverage code → test.** The criteria check walks spec → test and finds
  "specified but untested". This one walks the other way and finds "coded
  without ever being specified or tested" — which is where an untested branch
  hides.
- **Documentation drift.** Did the change leave any repo doc or skill stale? A
  new flow the `verify` skill does not mention is a flow the next person cannot
  exercise.

Writes `.specs/features/<slug>/validation.md`.

FAIL → `fix-gaps` fixes and `re-verify` redoes it **from scratch** (does not
compare against the previous report). One round only in headless; then the
flow stops.

`verdict-gate` (bash) greps for `**Overall**: ✅ Ready`. **Grep, not model
judgement** — an agent talks itself into it; a grep does not.

### ⑤ Contract and PR

`sync-capabilities` only runs **after** the gate: it folds the verified
behaviour into `.specs/capabilities/`. FAIL syncs nothing — unverified
behaviour never enters the contract.

`create-pr` opens the PR **already ready** (not draft): it went through `review`
(plus `fix`, when must-fix items remained) and through independent
verification, so it is finished work, not a draft. The body cites the verdict,
the sensor result and that review's triage — including what was **refused and
why**. External review (CodeRabbit) comes after, on the PR, and that is exactly
why it is not born as a draft.

`finalize` checks the PR's base and summarises where each piece of evidence
ended up.

---

## When a run dies midway: resume, do not re-run

**This is the command, and it does not appear in `archon --help`:**

```bash
archon workflow resume <run-id>          # id comes from `archon workflow runs`
```

It skips the nodes already completed (`[review] Skipped (prior_success)`) and
restarts at the one that failed, **inside the same worktree**. Measured in a
probe: run with `a → b → c`, `c` failing; `resume` executed only `c`.

**What does NOT resume, and each one costs the whole pipeline again:**

| attempt | what happens |
| --------- | -------------- |
| `archon workflow run <name> --branch <slug> "<msg>"` | a **new** run, from scratch. That is how `avaliacoes` re-paid for `implement` |
| re-invoking identically, same cwd and same message | does not resume. Archon's embedded doc says "auto-resume is default" — **it is false through the CLI**, tested |
| a fixed `--conversation-id` across invocations | does not resume. Tested |
| the `--resume` flag | matches the run by **cwd**, not by id. From the repo root it picks the wrong run; pointed at the worktree (`--cwd`) it blows up with `Cannot resume: repository registration failed` — [issue #2127](https://github.com/coleam00/Archon/issues/2127), **still reproduces on v0.6.0** despite being closed |

The price of not knowing this: 8 runs of `avaliacoes`, US$ 25 of model, and 78
of the 142 agent minutes spent in `implement` re-entering a finished feature.

**Before resuming, kill the zombie run.** A run left in `running` with no live
process blocks the next one and does not show up as a failure:

```bash
archon workflow status                   # has it been "running" for hours?
archon workflow abandon <run-id>         # `cancel` does not exist as a CLI subcommand
```

### `one_success` is not what the name suggests

Measured in a probe, because intuition gets this wrong:

| parents | `one_success` | `none_failed_min_one_success` |
| ---- | ------------- | ----------------------------- |
| one failed + one completed | **runs** the child | skips |
| one skipped + one completed | runs | runs |
| one failed + one skipped | skips | skips |

The dangerous row is the first. A node with `one_success` next to a sibling that
**always completes** lets the failed parent through — that was the case of
`adr-gate`, where `remaining-tasks` (bash, always green) sits next to
`implement`: an `implement` dying midway released `validate → review → fix →
verify → create-pr` over a half-built feature. The test gate does not catch
this — code that never got written breaks no test. Found by CodeRabbit on PR
#39 and corrected to `none_failed_min_one_success`.

The rule still lets a **skipped parent** through, and that is what `adr-gate`
needs: `implement` has a `when` and is legitimately skipped when no open
checkbox remains in `tasks.md`. The obvious objection — "and an `implement`
skipped because an ancestor broke, does that pass too?" — dies in the graph:
**every ancestor of `implement` is `remaining-tasks` or an ancestor of it**. A
broken ancestor skips or fails both parents, and then the gate has no completed
parent at all. The pair "skipped + completed" is only reachable through the
`when`, which is the deliberate path.

**The other `one_success` in the repo are correct and must not be swapped**: in
all of them, the parents are mutually exclusive branches (`investigate`/`plan`,
`verify`/`re-verify`), so the dangerous combination is not reachable. The
comment on each node explains why — read it before "making them uniform".

### Failure does not propagate as failure: it propagates as "skipped"

The table above is about **direct** parents, and it is literal —
`checkTriggerRule` only looks at their state (`dag-executor.ts:1156`). What
almost nobody assumes is what happens to the **grandchild**: a node skipped
because an ancestor failed is recorded as `skipped`, not as `failed`
(`dag-executor.ts:5700`).

Practical consequence, and it has already cost a bug here: red `gate` →
`respond` becomes `skipped` → a `finalize` with `none_failed_min_one_success`
over `[respond, collect]` sees "one skipped + one completed" and **runs**,
announcing treatment of a reply that was never posted. The protection was
written and aimed at the wrong target: it covered `respond` **failing**, not
`respond` **vanishing**.

The fix worth making is not adjusting the trigger rule — that solves the
instance, not the class. It is having the reporting node **consult the world
instead of asserting what it did**. A report derived from counts (open threads,
review on HEAD, PR state) has no way to lie about a run that broke midway; a
report asserting what the flow itself did, does. `tlc-apply-feature`'s
`finalize` follows that rule by reading the PR instead of declaring success.

### `remaining-tasks` still earns its place

It is not redundant with `resume`: it covers the case where the new run is
legitimate (corrected spec, a session on another day) and there is no previous
run to resume. A grep answering "no open checkbox remains" is cheaper than
waking Opus for it to discover the same thing. **An equivalent checkpoint for
`review`, `fix` and `verify` was evaluated and discarded** — it would duplicate
native resumption, which already skips completed nodes without any machinery in
the YAML.

---

## What left the branch on 2026-08-04, and why

This file once described seven workflows. Today it describes **one**.

The other six — `archon-fix-github-issue`, `tlc-fix-bug`, `tlc-db-change`,
`tlc-pr-review`, `tlc-pauta-to-issues` and `tlc-pr-findings` — were written on
this branch and **never ran end to end**. They passed `archon validate`, which
proves syntax, not behaviour. Leaving untested YAML visible to Archon advertises
support that does not exist, and proves seven things at once: any failure
becomes expensive to locate.

They come back **one per PR**, each answering a single question — "does this
flow correctly reuse the line already proven?". The order and the `git checkout`
to recover them are in `README.md`, Backlog section.

Three things the pruning changes day to day, worth knowing:

- **`archon-fix-github-issue` was an override.** Without our file, that name
  resolves to Archon's **bundled** workflow, which does not know this repo's
  rules, has no `spec-gate` and does not route to tlc. Do not run it thinking
  it is ours.
- **Database changes** stay covered: the `db-change` skill does migration + RLS
  + pgTAP together in a session, and it is the same skill `tlc-apply-feature`'s
  `implement` uses.
- **CodeRabbit review findings are treated by hand** during the pilot.
  `tlc-pr-findings` comes back as a **skill**, not as a workflow: when the
  automatic loop died, the work became interactive — you trigger it when the
  comments arrive, follow the triage and sometimes need to decide a
  `NEEDS_DISCUSSION`. What the workflow bought and the skill does not buy for
  free is mandatory ordering and a mechanical gate; that comes back as a script
  (collect → agent triages → `repo-gate.sh` → publish the replies), not as a
  DAG.

### What building the review cycle measured, and still holds

None of this depends on the files that left — it holds for whoever treats
comments by hand, and for the skill when it comes:

- **Collecting through a single channel returns half.** A finding CodeRabbit
  cannot pin to a diff line becomes text in the review body, under
  `Outside diff range comments (N)`, and **does not appear** in
  `gh api repos/<o>/<r>/pulls/<n>/comments`. Measured on PR #39: 2 of 4
  findings. The rest lives in `.../pulls/<n>/reviews`, and only the REST
  endpoint carries the `commit_id` — the field that ties the review pass to the
  code it saw.
- **A resolved thread vanishes from the collection**, and CodeRabbit
  auto-resolves when it judges that a commit addressed the finding. Whoever
  trusts only the list of open threads loses what it closed on its own.
- **The counter in the review body is frozen text**: it does not decrease when
  things get fixed. It serves for reporting, never for deciding "there is still
  work".
- **CodeRabbit's auto-pause is the worst failure mode there is here**: after 5
  reviewed commits it silently stops reviewing, and this repo's convention is
  one commit per fix. The `.coderabbit.yaml` zeroes the pause; if it still
  stops, `@coderabbitai review` in a comment breaks through.
- **Do not chase "zero comments".** A finding refused with a written reason in
  the thread beats a fix for a non-problem — and the written reason is what
  lets whoever reviewed contest it.

### The stamp that wins

Guarantee no. 3 ("nothing mutates after the stamp") is bought with
**ordering**: review and fixes come before `verify`, so `validation.md`
describes the code that reaches the PR. Treating a finding after the PR is
open is the only step that changes code **after** the stamp — and then the
attached evidence goes stale.

`validation.md` records `**Commit verificado**: <sha>` to make this decidable —
and the sha is that of the **last code commit**, not HEAD's:

```bash
git log -1 --format=%H -- . ':!.specs'
```

**Stamping raw HEAD does not work, and that has already been a defect here.**
The Verifier itself commits `validation.md` after stamping, and
`sync-capabilities` commits again: HEAD ends up different from the stamp
without a single line of code having changed, and the comparison would flag
drift on every run — which is the same as flagging nothing. Excluding `.specs/`
cuts exactly the class the flow itself produces after stamping: the field comes
to mean **the last commit outside `.specs/`**. Evidence arriving later does not
move it; a source change does.

**The cut is by `.specs/`, not by "code".** A later commit in `docs/` or in this
file also moves the stamp — and then the comparison flags drift without a line
of source having changed. It stays that way on purpose: the alternative is an
allowlist of code paths, which must be maintained in every repo the skill lands
in and goes stale silently. A false alarm from a doc commit costs a re-read; a
missed alarm from a source commit costs a PR with lying evidence.

Checking afterwards, by hand, is the same command on both sides:

```bash
grep 'Commit verificado' .specs/features/<slug>/validation.md
git log -1 --format=%H -- . ':!.specs'
```

Different? The evidence is stale: run the Verifier again before merging.

## Known debt

**The triplicated core was resolved, and the pruning of 2026-08-04 reaped the
result.** Three workflows opened PRs carrying a copy of the same review and
verification chain; the extraction into single-owner pieces came before the
pruning, which is why removing six workflows did not take away what was worth
keeping. What is still standing, all of it called by `tlc-apply-feature`:

| piece | where it lives |
| ---- | --------- |
| repo gate (lint/typecheck/test + conditional pgTAP) | `scripts/repo-gate.sh` |
| verdict gate (parameterised by report and format) | `scripts/verdict-gate.sh` |
| ADR input fingerprint | `scripts/adr-inputs-fingerprint.sh` |
| PR close-out (base re-target + handoff) | `scripts/pr-finalize.sh` |
| review + triage (read-only) | `commands/tlc-review.md` |
| must-fix correction | `commands/tlc-fix-review.md` |
| tlc Verifier contract | `commands/tlc-verify-feature.md` |
| capability contract sync | `commands/tlc-sync-capabilities.md` |

**`fix-gaps` and `re-verify` stayed inline on purpose.** They anchor on the
spec (`.specs/features/<slug>/`), write a `validation.md` versioned on the
branch, check capability regression and use the `**Overall**: ✅ Ready` format.
The equivalent commands of the removed flows anchored on the investigation and
wrote `verification.md` in the run's artifacts, with `VERDICT: PASS`. Forcing a
single command would require a conditional inside the prompt — trading honest
duplication for hidden coupling.

`verify`, on the other hand, **is a command with a single caller**, and stays
that way on purpose: the criterion is "would the copy turn into divergence?",
and the answer changes with the size of the contract — 79 lines of verification
are worth versioning separately even with one caller. The model tier already
charged that interest, two weeks out of date in two files.

**The debt charged interest before it was paid — worth recording.** The
downgrade from `large` to `medium` in the review chain was applied only to
`tlc-apply-feature`; the other two stayed on `large` for two weeks, until
CodeRabbit pointed it out on PR #39. Three more lags came with it in the same
place: the "externally reviewed" claim in `create-pr`, the `verdict-gate`
comment citing external review, and — the worst — the same prompt ordering
`Create a draft pull request` at the top and `(not a draft…)` in step 6. That
last one had a real consequence: `.coderabbit.yaml` does not review drafts, so
the PR would have gone out without the review the flow had come to depend on.

### The pilot's four blockers — fixed on 2026-08-04

Found in static evaluation, before any run. They stay recorded because the
first three are the same class of error: **a later step undoing an earlier
step's guarantee, without anyone noticing.**

1. **`create-pr` committed source after the stamp.** The prompt ordered
   committing "source files that are part of the feature", and it runs after
   `verify`, `verdict-gate` and `sync-capabilities` — meaning the PR could go
   out with code the Verifier never saw, carrying a `validation.md` that said
   otherwise. Now it classifies every dirty file: scratch is ignored, evidence
   is committed, **and anything else fails the node**. It does not fix, does not
   commit: it stops. The choice is deliberate — automatic recovery here would
   mean opening a PR with false evidence.

   **Evidence is a list of exact files, not a directory** —
   `.specs/features/<slug>/validation.md`, `.specs/LESSONS.md`,
   `.specs/lessons.json`, and nothing else. It took two CodeRabbit passes on
   #39 to get there, and both pointed at the same thing: the whole of
   `.specs/**` as "evidence" sweeps into the commit things that are not
   evidence.

   - `.specs/capabilities/` is the **living contract**. The `capability-gate`
     right before already ran `capabilities.py check` and proved the directory
     clean in the worktree and in the index; dirty here means the gate's
     guarantee broke after it.
   - `spec.md`, `design.md`, `tasks.md`, `context.md` are **input**, written
     interactively before the run. They are the ruler the Verifier measured the
     code against — `validation.md` is a statement *about* them. A dirty
     `spec.md` here means the ruler moved after the stamp, and the report comes
     to claim conformance with a spec that no longer exists.

   The second case is the worse of the two, and for a specific reason: the
   stamp is `git log -1 --format=%H -- . ':!.specs'`, which **excludes `.specs/`
   on purpose** (see "The stamp that wins"). Source drift the later check
   catches; spec drift it does not. Committing that as evidence is not just a
   misclassification — it buries the only clue.
2. **`capability-gate` did not see staged.** `git diff --quiet` looks at the
   worktree; a `git add` without commit vanished from the worktree diff and the
   gate approved a contract that was not on the branch. Now it checks worktree
   **and** index.
3. **The SHA stamp never matched** — see "The stamp that wins" above. It now
   records the last **code** commit.
4. **Red CI.** `pnpm@11.13.0` is a broken release — `@pnpm/exe` shipped without
   a binary and `pnpm/action-setup` refuses to install it
   (`ERR_PNPM_BROKEN_PNPM_RELEASE`). Bumped to `11.20.0`, with
   `--frozen-lockfile` proven locally: the lockfile is still accepted, no
   regeneration.

What **none** of this verified: whether the flow works. Static analysis catches
contradiction; only the run catches behaviour.

### Retry: off on every AI node, and the reason is expensive

**Archon classifies rate-limit text as a TRANSIENT error and re-executes the
node.** It is not a retry of the last call: it is the **entire agentic session**
again — re-read the artifact, re-reason, re-edit. With backoff of 2s, 4s and
8s, against a limit that resets in **hours**.

Measured on 2026-08-03, in round 2 of the review loop (since removed): the
triage node hit the session limit and Archon re-executed it **3 times**, adding
up to 15 rate-limit events in a single run. Four full executions of the flow's
most expensive node, all doomed from the first — because no 8-second wait
returns quota that only comes back in hours.

That is why every AI node in the `tlc-*` workflows carries:

```yaml
retry:
  max_attempts: 1
```

**The asymmetry is the argument.** Without retry, a network error costs a
resume — `archon workflow resume <run-id>`, which skips everything that already
passed and is cheap. With retry, a quota limit costs 4× the pipeline's most
expensive session, and the worst part is that it costs it **with no chance of
success**.

There is no configurable middle ground: `retry.on_error` only accepts
`transient` or `all`, and rate-limit text falls under `transient` in both.
Either you turn it off, or you pay.

`retry` is a **parse error** on `loop`/`loop_group` nodes — in loops it goes on
the body nodes, never on the group node.

### Who runs each node, and why `verify`/`re-verify` stay on medium

Since 2026-08-06 the nodes with a role in the design use an **alias**, not a
tier: the alias says *who does the work*, the tier says *how capable it needs to
be*. A mechanical node (`extract-slug`, `create-pr`) stays on a tier, because
there the only question is size.

| alias | provider | nodes | writes source |
| --- | --- | --- | --- |
| `@author` | claude/opus | `implement` | yes |
| `@fixer` | claude/sonnet | `fix`, `fix-gaps` | yes |
| `@reviewer` | codex | `review` | no |
| `@verifier` | codex | — (defined, not wired) | no |

One alias per role, not per family, so that two roles in the same family can
diverge: `@author` starts from a spec, `@fixer` starts from a list of
`file:line` — different work, different size.

`@verifier` is not wired into `verify`/`re-verify` because those nodes use
`output_format`, and the structured verdict is what fires `fix-gaps`' `when`;
it is not verified that the Codex adapter honours that. Meanwhile they stay on
`medium`. The guarantee the verification nodes buy is **author ≠ verifier**,
and it is a property of the **graph** — separate node with `context: fresh` —
not of the model's size. Sonnet with a zeroed context still does not inherit
the mental model of whoever wrote the code. What is lost is depth; what is
gained is the flow fitting inside a quota window instead of dying midway
without verifying anything. Half a flow on Opus delivers less than the whole
flow on Sonnet — and that is not a hypothesis: `avaliacoes`' `re-verify` died
from the session limit on 2026-07-31, already running on medium.

**What building the external review cycle measured is in the section "What
left the branch" above** — the collection channels, the auto-pause, the
`commit_id`. Three measurements stay here because they are about *tooling*,
not about that flow, and will reappear in the skill that replaces
`tlc-pr-findings`:

- **The noise pruning failed open.** The collector cut the `<details>` blocks
  for "Analysis chain" and "Prompt for AI Agents" (45% of the volume) and left
  "skip" mode when the tags closed — except CodeRabbit's markdown **does not
  close all of them**: 21 openings to 19 closings in a real collection on
  2026-08-04. The open block dragged the filter to the end of the file and
  swallowed the header of the following entries: **3 of the 8 open threads
  vanished**, no error, no warning, with the artifact looking complete. A noise
  filter must reset its state at every entry boundary. **A collector that
  fails open is worse than one that crashes** — whoever reads the artifact has
  no way to suspect it.
- **The thread the reviewer closes after replying lands in no channel**: the
  collection skips resolved, and the "closed without us commenting" audit
  requires that we never spoke. With the last word being theirs, it could be a
  rebuttal. Measured on #39: 15 in that situation, **all 15 confirmations**, 10
  with the `<review_comment_addressed>` marker CodeRabbit itself adds.
- **A frozen signal cannot decide anything.** The counter in the review body
  does not decrease when things get fixed; using it as "there is still work"
  locks the verdict forever. It was the defect that made the old collector
  declare an open finding on a merged, fully treated PR.

**Run end to end on `avaliacoes` (PR #38).** It stopped being reasoning. Which
nodes earned their pay, by that feature's evidence:

- **`review-fix`** (the single node back then; today `review` + `fix`) found a
  real bug before the PR: the invitation `GET` ignored the `error` of both
  queries in the `Promise.all`, so a database failure became "no completed
  appointment", with no log. It refused two findings with a written reason.
- **`verify`** failed it, and for something no other layer would catch: the
  "anonymised client does not write a review" guard lived as an isolated `if`
  in the route, and the mutation that switched it off went through the whole
  gate without killing a single test. LGPD trail. `fix-gaps` extracted it into
  a tested pure function; the mutation re-injected afterwards died.
- **`remaining-tasks`** paid for itself: `implement` skipped by grep, zero cost,
  against the ~US$ 1.86 a re-entry of it had cost to produce nothing.
- **The order** (review before verification) proved itself: the Verifier's
  stamp landed on the final code, with no reconciliation pass.

What the feature also showed, and became its own section above: **the pipeline
did not have a design problem, it had a resumption problem** — the 8 runs were
new `workflow run`s instead of `workflow resume <run-id>`.

The runs' `*-findings.md` and `validation.md` live in
`~/.archon/workspaces/<user>/<repo>/artifacts/runs/<run-id>/`.
