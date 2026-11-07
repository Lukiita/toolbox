# Memory

Three things outlive a session under `.specs/`: decisions that constrain future features, lessons
distilled from real verification failures, and the capabilities - what the system guarantees today.
Where a feature stopped is in its `checks.md` `## Handoff` and in git.

## `.specs/STATE.md`

```markdown
# Project state

## Decisions

| ID | Decision | Rationale | Status | Date |
| --- | --- | --- | --- | --- |
| AD-001 | Webhook ingest is idempotent on provider delivery id | replays are routine and cheap to dedup at the edge | active | 2026-02-14 |
| AD-002 | Money is stored in integer cents | superseded by AD-007 | superseded by AD-007 | 2026-03-02 |
```

Edit only the body of `## Decisions`; overwriting the file loses the log.

A decision belongs here when a future feature has to conform to it and it passes the same
three-part test as an ADR: hard to reverse, surprising without context, a real trade-off. A
convention that fails the test is a rule for the project's `AGENTS.md`, not an entry. Write it when
the choice is made. An answer that departs from a binding source is an entry whatever the test
says, because the gates read it here: the Decision says what the product shows instead, the
Rationale quotes the question and the option chosen, and the plan's `## Differences from the
source` rows cite the id. A `Landing` door that reaches past the feature gets a row in each place:
the shape in `Landing`, the constraint here.

Where the substance lives (the `domain-modeling` skill): what a domain word means is never an
entry - it goes to the `CONTEXT.md` glossary. Where the repo keeps its decisions elsewhere - an ADR
directory (`docs/adr/` or its own) or another log - a decision that passes the test is written
there and its `AD-NNN` row is a one-line pointer (`see docs/adr/NNNN-slug.md`): the log keeps the
sequence and the supersession chain the gates read, the record keeps the substance, and nothing is
written twice.

## `.specs/capabilities/`

The living behavioural contract, one file per domain area, owned by the `capability-sync` skill.
Plan reads the areas a feature touches, the Verifier checks the scenarios its diff touches, and a
feature whose gate passes folds its verified criteria in ([verify.md](verify.md)). Edit it only
through that skill: every file there must pass its `capabilities.py check`.

Every `active` `AD-NNN` constrains the work. Conform, or append an entry that supersedes it (set the
old row's status to `superseded by AD-NNN`) and say why.

## Resuming work - a new session, or after a compaction

A compaction is a resume: the summary keeps the task and drops the rules. Re-read `SKILL.md` and the
reference for the phase the files show, then read `.specs/STATE.md` and the feature's files -
`plan.md` and its `**Approved**:` line, `checks.md` with its completion marks and `## Handoff`,
`proofs.md`, `verification.md`, `screens.md` - and reconcile them against git: the commits are
fact; a note written before a crash is intent. After a compaction in the middle of a run, continue
when the files and git agree, and stop only on a conflict. In a new session, propose the next step
before writing code.

Where the files put you - the first row that holds:

| The files show | Next |
| --- | --- |
| `plan.md` with no `**Approved**:` line | the plan: open questions are still the user's - present it and stop |
| no `checks.md` | Checks |
| a check not closed | Build; a check whose commit is on the branch is closed - mark it |
| a screen and no `**Walked:**` line | the walk and the pictures (build.md) |
| no `proofs.md`, or one followed by a commit that changes code outside `.specs/`, and nothing dispatched | `check_proofs.py` |
| `**Dispatched:**` names a sub-agent whose report is not on disk (`verification.md`, `screens.md`) | wait for it; send it again only when it cannot return - a new session - and say so on the line |
| an open finding, or `screens.md` `**Round**: 1` that diverges or names an older `HEAD` | the fix pass, then round 2 |
| `screens.md` `**Round**: 2` | the script and the gate, then the capability sync; what still fails goes to the user - there is no third round |
| `verification.md` with every finding closed | the gate, then the capability sync (verify.md) |

## Lessons

You supply the judgement - read the failure, phrase the lesson, cite its grounding - and
`scripts/lessons.py` does the bookkeeping: IDs, recurrence across distinct features,
candidate→confirmed promotion, pruning, demotion, rendering.

| File | Owner |
| --- | --- |
| `.specs/lessons.json` | the script - do not hand-edit |
| `.specs/LESSONS.md` | the script - read it, do not write it |

`confirmed` lessons are the playbook. `candidate` ones need a second distinct feature. `quarantined`
ones failed when applied and are ignored.

### Write - after the gate passes

For each finding in `verification.md`, record one lesson:

| Finding | `--signal` |
| --- | --- |
| A check whose test passes without holding its criterion - a `no` in `## Checks`, an assertion looser than the value, a rule proven on too few cases | `weak_test` |
| A criterion that fixed no precise outcome, so no test could hold it | `spec_precision_gap` |
| An example of the Verifier's own that broke a rule | `ac_gap` |
| A check or criterion that contradicts a binding capture | `spec_deviation` |

```bash
python3 <skill-dir>/scripts/lessons.py add \
  --feature "<feature folder>" \
  --signal  "weak_test" \
  --source  "<file:line or check id from the finding>" \
  --text    "<one general, actionable sentence>" \
  --scope   "<optional: billing, routes, repo-layer>"
```

`--source` is required; a lesson with no grounding is an opinion. Deduplication is exact after
normalization, so write the general rule in canonical, terse words: "Assert the exact persisted
status value, not just that a status field exists", not "the test on line 88 was too weak". One
lesson per finding. Lessons about this codebase only, never about how to run the skill. If the
report had findings and you recorded nothing, say so in chat.

### Read - at Plan and before writing checks

```bash
python3 <skill-dir>/scripts/lessons.py --root <project> list --status confirmed
python3 <skill-dir>/scripts/lessons.py --root <project> list --status confirmed --scope billing
python3 <skill-dir>/scripts/lessons.py --root <project> list --status confirmed --query idempotency
```

Load `confirmed` only, filtered to the area this feature touches.

### Demotion and turning it off

A confirmed lesson loaded for this feature whose failure recurred anyway: `lessons.py penalize --id
L-NNN`. Two penalties quarantine it. The script accepts only a `confirmed` lesson here - a
candidate was never loaded as guidance, so it cannot have failed when applied. To disable the layer
for a project, delete `.specs/lessons.json` and `.specs/LESSONS.md`.
