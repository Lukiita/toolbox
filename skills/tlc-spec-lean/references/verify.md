# Verify

A safety net that raises the work, not an audit of it. A script settles what can be settled
mechanically; a fresh sub-agent spends a few minutes on what needs judgement: where the code can
be wrong while every test stays green. It runs once per feature, beside the screens sub-agent.

## Author is not verifier

The Verifier is a fresh sub-agent with no inherited context; a self-check reapplies the thinking
that produced the gap. The author's notes in `checks.md`'s `## Handoff` carry that thinking, so the
Verifier reads the claims and proofs, not the Handoff. With no sub-agent mechanism, run this file in
a new session and write `Verifier: self-verified (degraded - no sub-agent)`; the gate flags it.

## The round

1. The builder runs `python3 <skill-dir>/scripts/check_proofs.py <feature>` at `HEAD`. It runs each
   `Run` group and each lone proof once, one at a time, finds each check's line in its group's
   output, runs the build, checks the pictures and the walk, and writes `proofs.md` with the tail of
   every run. A red row is the builder's to fix before anything else.
2. The builder dispatches, in the same turn and in parallel, the screens sub-agent when a criterion
   cites a capture ([verify-screens.md](verify-screens.md)) and the Verifier. Both read the same
   `HEAD`. The dispatch prompt names the feature, the files and the diff range, and nothing about
   what to accept. Each goes on the `**Dispatched:**` line of `checks.md` `## Handoff` before it is
   sent; a builder resuming after a compaction that finds one there with no report on disk waits
   for it instead of sending another.
3. The builder fixes everything both name in one pass, reruns `check_proofs.py <feature>`, and when
   the fix changed code re-saves every picture at the new `HEAD` and resumes the round-1 screens
   sub-agent for round 2 (it is the last), writes the closing commit into each finding, and runs the gate.
   There is no second Verifier: the script shows the proofs green at the new `HEAD`, the fixed tests
   among them. A `survived` mutant, or one `not run`, is closed by running it at the fix commit with
   "Mutants" steps 1-5 below and writing the test that goes red in its `Killed by` cell. What still
   fails goes to the user. A survivor no test can kill, because no caller sees the fault, is one of
   those: the user, not the builder, replaces its row with another fault on the same rule.

## What the Verifier does

It receives `plan.md`, `checks.md`, `proofs.md`, `.specs/capabilities/` when it exists, the diff
range and this file. It does not rerun the proofs at `HEAD`; `proofs.md` already says which tests
ran and passed, with the output that shows it. It fixes nothing: in the real tree its writes are
`verification.md` and throwaway examples it does not commit, and the only suites it runs are the
mutants', in a scratch worktree it removes before it returns.

**Each check's test.** For every check, open the test its proof selects - the one whose line the
`run` proof names, or the one a lone proof's filter picks - and judge whether it would fail if the
claim were false: it asserts the value the claim fixes, on the cases the claim names, at the layer
the claim sits. Write one `## Checks` row per check. A `no` is a finding: the test passes without
holding its criterion. Look hardest where a wrong decision costs most - a returned value, a
condition, a bound shifted by one, an order, a sign, a filter - and at rules the diff touched that no
check names: a rule on the web with no test is still a rule.

**Own examples.** For two rules the plan states with examples, try a value neither the plan nor the
checks name - the other side of a boundary, an empty set, a large one. Run each at `HEAD` as a
throwaway test or a request. A rule that breaks on yours is a finding.

**Mutants.** Reading a test judges it; a mutant measures it. For every rule that changes an outcome
the diff touched - the list in [checks.md](checks.md) "The level of each proof": a boundary, a
guard, a state transition, a dispatch, a mapping, an order - inject one to three behaviour faults
where a wrong decision costs most: the comparison shifted by one (`>` to `>=`), the condition
flipped, the value or error code returned, a normalisation or side effect removed, the bound moved
one unit inside (a coupon that expires one millisecond early). Pick faults a caller can see: one
that changes nothing a caller can reach measures nothing, so drop it and pick another on the same
rule. Mutate in a scratch, never the real tree - the isolation of tlc-spec-driven's discrimination
sensor:

1. Record the real tree's `git status --porcelain`; it must read the same after step 5.
2. Run `mktemp -d` and write down the path it prints; every later step names that path literally,
   written here as `<scratch>` - a shell variable does not survive between tool calls, and
   `git -C ""` acts on the real tree. `git worktree add <scratch> HEAD`; if the add fails, stop and
   remove nothing. Without git worktrees, copy only the files you will mutate into `<scratch>`,
   mutate the copies and point the run at them. `git stash` is never the scratch.
3. Run the `Run` group that covers the rule against `<scratch>`, unmutated: it must pass, because a
   red baseline makes every mutant read killed. When it cannot pass, every planned mutant reads
   `not run - baseline red` and the setup is a finding, with what the scratch lacks; the builder
   makes it run and runs those mutants.
4. One mutant at a time: change the line, run the group, note the test that went red, restore with
   `git -C <scratch> checkout -- .` (or a fresh copy of the file) before the next. Stop a run that
   takes three times the baseline's time: the test it hung in killed the mutant.
5. `git worktree remove --force <scratch>` (or delete the copies), also when a run failed or hung.
   Compare `git status --porcelain` with step 1: if it differs, stop, restore the real tree, and
   treat the mutant runs as invalid. Then write the `## Mutants` rows.

Each mutant gets a `## Mutants` row. `Killed by` is the test that went red, named as `## Checks`
names one - `` `<file>` `<name>` `` and nothing after; a mutant no test kills reads `survived` and is
a finding. A `|` inside a cell is written `\|`. A diff that touches no such rule writes
`None - <why>`.

**Assertions that do not hold the value.** Across the `## Checks` rows, report the tests whose
assertion is looser than the value the criterion fixes, that prove a rule on two cases out of nine,
or that sit at another level than the repo's test docs name for that layer.

**The plan against the captures.** When a capture binds, a check or criterion that contradicts what
it draws - a label spelled differently, a state turned into a screen of its own - is a finding, even
with a green proof. Departures listed in `## Differences from the source` with `Confirmed: y` are
approved.

**Capabilities the diff touches.** `.specs/capabilities/` is what the system guarantees today, kept
by the `capability-sync` skill - the regression net between features, without which only the
newest plan is ever checked. List it with
`python3 <skill-dir>/../capability-sync/scripts/capabilities.py list`; for each scenario whose
behaviour the diff touches, confirm it still holds: a test that still asserts the outcome, or a
throwaway example at `HEAD`. A broken scenario is a finding, and one with no evidence either way is
not a pass.

## Report

Write `.specs/features/<feature>/verification.md`:

```markdown
# <Feature> verification

**Verdict**: FAIL
**Proofs**: `proofs.md` at <sha>
**Verifier**: independent sub-agent (author != verifier)

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `stock-map.service.test.ts` `counts a Transfer in on its destination` | no - asserts the count, not the sign |
| C7 | `stock-map.service.test.ts` `counts items at zero` | no - `toBeDefined()` |
| C9 | `transfers.e2e.test.ts` `rejects a transfer to the same location` | yes |

## Mutants

| Rule | Mutant | Killed by |
| --- | --- | --- |
| same-location guard | `transfer.aggregate.ts:31` `from === to` -> `false` | `transfers.e2e.test.ts` `rejects a transfer to the same location` |
| Transfer in sign | `stock-map.service.ts:54` `+qty` -> `-qty` | survived |

## Findings

| Finding | Evidence | Fix | Closed |
| --- | --- | --- | --- |
| Transfer in is counted as out and no test fails | C1's test asserts the count, not the sign; mutant `+qty` -> `-qty` survived | assert the sign of a Transfer in on its destination | |
| C7 asserts the count exists, not that it is 5 | `stock-map.service.test.ts:88` - `toBeDefined()` | assert `atZero` is 5 on the capture's data | |
```

Every check gets a `## Checks` row with the test named; the gate refuses a missing row or an empty
`Test`. With nothing to report, write `None - <one line on what was probed>` under `## Findings` and
`**Verdict**: PASS`. Return the findings in chat. The builder fills `Closed` with the commit that
fixes each one and the check that now proves it, and the `Killed by` cell of each `survived` or
`not run` mutant with the test that kills it at that commit; the gate refuses an empty `Closed` and
a mutant left `survived` or `not run`.

## The gate

```bash
python3 <skill-dir>/scripts/validate_verification.py <feature>
```

It reads `proofs.md` (every check and run has a passing row, written at `HEAD` or before commits
that touch only `.specs/`), the `## Checks` table (a
row with a test for every check),
`screens.md` when a criterion cites a capture (round 1 or 2, judged at a `HEAD` no code commit has
passed), the plan's `**Approved**:` line, every finding closed, and the `## Mutants` section (each
row's `Killed by` a test named `` `<file>` `<name>` ``, or one `None - <why>` line). `0` the feature
is done. A feature verified before the `## Mutants` section
existed owes it too: `None - verified before mutants`.

## Distill lessons

After the gate passes, turn each finding into one lesson with `scripts/lessons.py`
([memory.md](memory.md)). A feature with no finding records nothing.

## Sync capabilities

After the gate exits 0, invoke the `capability-sync` skill: fold the criteria this feature verified
into `.specs/capabilities/`, then run its gate, which must exit 0:

```bash
python3 <skill-dir>/../capability-sync/scripts/capabilities.py check
```

This is part of done, not a chore after it: a sync that cannot pass its check leaves the feature
open. A red gate syncs nothing - unverified behaviour never enters the contract. With no Skill tool
(a headless run), follow `<skill-dir>/../capability-sync/SKILL.md` directly.
