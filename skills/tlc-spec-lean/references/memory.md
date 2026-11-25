# Memory

Decisions that constrain future features outlive a session in `.specs/STATE.md`, and what the
system guarantees today in `.specs/capabilities/`. The user's
request is in the feature's `request.md`. Where a feature stopped is in its `plan.md` lines - in
`request.md`'s, when the change skipped the plan - and in git.

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

Where the substance lives (the `domain-modeling` skill): what a domain word means is never an
entry - it goes to the `CONTEXT.md` glossary. Where the repo keeps its decisions elsewhere - an ADR
directory (`docs/adr/` or its own) or another log - the decision is written there and its `AD-NNN`
row is a one-line pointer (`see docs/adr/NNNN-slug.md`) that keeps its `Status` column: `validate_plan.py` looks up the `AD-NNN`
behind a `Differences from the source` row in `.specs/STATE.md` only, so the row stays, the record
keeps the substance, and nothing is written twice.

A decision belongs here when a future feature has to conform to it and it passes the same
three-part test as an ADR: hard to reverse, surprising without context, a real trade-off. A
convention that fails the test is a rule for the project's `AGENTS.md`, not an entry. Write it when the choice is made. An answer that departs from a binding source is one
too: the Decision says what the product shows instead, the Rationale quotes the question and the
option chosen, and the plan's `## Differences from the source` rows cite the id. A `Landing` door
that reaches past the feature gets a row in each place: the shape in `Landing`, the constraint here.

Every `active` `AD-NNN` constrains the work. Conform, or append an entry that supersedes it (set the
old row's status to `superseded by AD-NNN`) and say why.

## Resuming work - a new session, or after a compaction

A compaction is a resume: the summary keeps the task and drops the rules. Re-read `SKILL.md` and the
reference for the phase the files show, then `.specs/STATE.md`, the feature's `request.md` and
its `plan.md`, and
reconcile them against git: the commits are fact; a note written before a crash is intent. After a
compaction in the middle of a run, continue when the files and git agree, and stop only on a
conflict. In a new session, propose the next step before writing code.

Where the files put you - the first row that holds; the lines are in `plan.md`, or in `request.md`
when there is no plan:

| The files show | Next |
| --- | --- |
| `plan.md` whose `**Approved**:` line holds no date and quote yet | the plan: open questions are still the user's - present it and stop |
| `**Review:**` not yet `sent at <hash>` | Build: the first slice no commit message names yet; the uncommitted changes in the tree belong to it - read them before building on them |
| `**Review:** sent at <hash>` and no `review.md` | wait for the reviewer; send it again only when it cannot return - a new session - and say so on the line |
| `review.md` and no `**Fix pass:** done` line | the fix pass |
| `**Fix pass:** done` | the report |

## `.specs/capabilities/`

The living behavioural contract, one file per domain area, owned by the `capability-sync` skill.
Plan reads the areas a feature touches ([plan.md](plan.md)). The fix pass folds the plan's criteria
in through that skill, in its own commit, so the tree ends clean and a resume never syncs twice
([review.md](review.md)); a criterion a finding you keep names stays out, and a change that skipped
the plan folds nothing - `request.md` holds no criteria. Every file there must pass its
`capabilities.py check`.
