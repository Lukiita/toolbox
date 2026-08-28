---
name: code-review
description: Reviews the branch diff against its base — BEFORE the PR exists, no PR needed. Independent reviewers in parallel (bugs twice over, project rules, and intent-vs-commits when there is no tlc flow), a confidence triage that drops false positives, and a deterministic base-divergence check. Use whenever the user asks for a code review, "revisa o que eu mudei", "olha esse diff", "tem bug nisso?", before opening a PR, or when an automated flow needs a review before the PR. Also when the user finishes an implementation and is about to commit or open a PR — reviewing before is cheaper than after. Do NOT use to review someone else's PR already open on GitHub (that is `/review`), nor to check that an implementation fulfils a spec (that is tlc-spec-driven's Verifier).
---

# Code review of the diff, before the PR

Runs on `git diff <base>...HEAD` — no open PR required, which makes it usable
inside a pipeline and in any project.

Two properties drive everything here:

**Precision matters more than coverage.** A review that points at ten things of
which three are real costs more attention than it saves — the reader learns to
ignore it. Hence the triage in step 4 and the "what not to flag" list.

**Reviewer and judge are separate roles.** The reviewers read the diff without
knowing about each other, and the parent reads it only after they have reported
— whoever sees the diff first forms an opinion and ends up defending their own
findings instead of judging the reviewers'. So the parent passes the *command*
along, and loads the diff only at triage.

## Process

### 1. Scope, without loading the diff

```bash
BASE="${1:-main}"                                  # origin/main if the local branch has diverged
git rev-parse "$BASE" >/dev/null || exit 1         # a bad ref fails here, not inside the agents
git diff --stat "$BASE"...HEAD                     # the summary only
git log --oneline "$BASE"..HEAD
```

Three dots (`A...B`) compare against the common ancestor — a change that landed
on the base after the fork does not pollute the diff.

**Do not run `git diff` without `--stat` here.** The full diff enters your
context only at triage (step 4), after the reviewers — before that it turns you
into one more reviewer, and the judge stops being independent.

Empty diff: say so and stop. Over ~1,500 lines: **do not slice it yourself** —
state the size and ask which area to start with. Automatic slicing multiplies
the cost and, worse, separates files that talk to each other, losing exactly
the bug that spans two files.

### 2. Base divergence (deterministic, no agent)

```bash
MB=$(git merge-base "$BASE" HEAD)
git log --oneline "$MB".."$BASE" -- $(git diff --name-only "$BASE"...HEAD)
```

Commits here mean: **the base gained changes in the same files after you
forked.** The merge will conflict, and a lazy resolution can undo a fix that is
already on the base. Anything returned is a finding — and it comes for free,
no model involved.

### 3. The lenses

Two fixed lenses — **bugs** and **project rules** — and a third, **intent**,
that runs only in a project without the tlc flow. Each lens is one agent, and
the bug lens runs in **two independent agents**: different runs find different
bugs, and the triage in step 4 filters the union. The separation is about
independence, not cost: a reviewer hunting bugs must not be primed by the rule
list, the rules reviewer must not be distracted by the bug, and neither may see
the other's findings before triage.

**With sub-agents:** one message, one Agent call (`general-purpose`) per
reviewer — three, or four with the intent lens. **Pass the diff command, not
its content** — each one runs `git diff` on its own. While they run, prepare
the triage without touching the diff: read the repo's written rules
(`AGENTS.md`/`CLAUDE.md`) and the step 2 result — that is what you will need to
confirm the findings.

**Without sub-agents** (a model or runtime without that capability): read the
diff **once** and run the lenses in sequence, in the same session, with the
same 400-word cap each — the bug lens once only: repeating it in the same head
is not independent. What is lost is the independence — reviewer and judge
become one head — so at triage treat your own findings as someone else's:
confirm each against the file, and reopen only what the diff does not show.

Do not improvise a third path: without sub-agents, it is sequential in the same
session.

Ask each reviewer for: findings as `file:line`, what is wrong, why. **400-word
cap.** The cap is not only output economy: a reviewer on a short budget
prioritises, a reviewer without one drifts into minutiae.

**Reviewer A — bugs, twice over.** Reads the diff hunting for what bites:
inverted condition, off-by-one, unhandled `null`/`undefined`, missing `await`,
swallowed error, race, unreleased resource, a value leaking where it should not.

Runs in **two agents with the same prompt**, unaware of each other. Do not merge
the reports or drop duplicates before triage: a finding both brought is signal,
and counts in its favour in step 4.

Give them the step 2 result as context, if any.

> Ask explicitly that it **follows the thread across files** when a value leaves
> one and lands in another. An expensive bug rarely fits in one file — the
> classic is the getter that swallows the error and the caller that treats the
> `null` as "not found".

**Diff touching SQL, a query builder or a migration** (visible in `--stat` and
in the file names): add to Reviewer A's prompt — "load
`~/.agents/skills/sql-quality/references/review-checklist.md` and apply the
checklist to the SQL part of the diff, in its order: injection and unbounded
scans first". It goes into both Reviewer A prompts — SQL is bug hunting, not a
separate lens, so it gets no agent of its own.

**Reviewer B — project rules.** Checks the diff against the repo's written rules
— `CLAUDE.md` / `AGENTS.md`, at the root and in the touched directories — and
`.specs/capabilities/`, when they exist. Four questions:

1. Was a written rule violated? **Quote the rule verbatim** — a rule that cannot
   be quoted probably does not exist.
2. Does the change break a scenario guaranteed in `.specs/capabilities/`? Those
   files say what the system promises today; breaking one silently is the most
   expensive regression there is.
3. Strong connascence crossing a feature/module boundary? A magic value repeated
   in two places (connascence of *meaning*), a fragile order of positional
   parameters (*position*), a duplicated algorithm that must change together
   (*algorithm*) — flag it naming the type and the refactor to the weaker form
   (named constant, named object, single source). Inside the same module,
   tolerate it: strong connascence close by is less of a smell than the same
   thing spread out.
4. A Fowler smell the diff **introduces**? Load
   `~/.agents/skills/code-review/references/smells.md` (twelve smells, each
   "what it is → how to fix") and flag it naming the smell and quoting the
   hunk. A written repo rule overrides the baseline; it is always a judgement
   call, never a hard violation — and what lint already catches does not count.

Without the files behind questions 1 and 2, questions 3 and 4 and common sense
remain: a convention established in the neighbouring code beats your
preference.

**Reviewer C — intent (only without tlc).** If the repo has no `.specs/` — that
is, no Verifier will check the implementation against a spec — a third reviewer
compares the diff with what the commits say (`git log "$BASE"..HEAD`, full
messages; the PR description, if there is one). Three questions:

1. Is something the message promises missing? Half-done work, a new `TODO`, an
   error path the commit claims to handle and does not.
2. Did something nobody asked for get in? A refactor hitching a ride, a touched
   file the message does not explain.
3. Any leftovers? Debug logging, dead code, a test flag.

Quote the commit-message line in each finding. With `.specs/` present, this
lens **does not run**: that is tlc's Verifier, with per-criterion tracing and a
discrimination sensor — duplicating it creates contradictions between layers.

### 4. Triage — yourself, no new agent

You are the judge: you hold the conversation context (what the change *meant*
to do), which no new agent would have. Now load the diff — `git diff
"$BASE"...HEAD` in full if it fits the step 1 limit; above that, only the files
cited in the findings. It decides the most common 0: "already there before this
diff".

First merge duplicates: same `file:line` and same problem is **one** finding,
and note how many reviewers brought it. Then score each finding 0 to 100:

- **0** — false positive, or a problem that existed before this diff.
- **25** — might be real, could not confirm.
- **50** — real and confirmed, but a nitpick or vanishingly rare.
- **75** — real, confirmed, happens in practice. Matters.
- **100** — certain; the evidence confirms it directly.

Confirm before scoring high: the hunk shows what changed, the file shows what
remains — open the cited file when the diff is not enough. A score without
evidence is a guess with a number on it. A finding that cites a project rule
requires checking that the rule says that. A finding both Reviewer As brought
independently starts with evidence in its favour — confirm anyway: two
identical guesses are still a guess.

**Keep the ≥ 80.** The cut is high on purpose: every surviving item should
deserve action, so the list gets read instead of skimmed.

### 5. Report

The report is state of the *branch*, not of the code, so it lives outside the
working tree — the same home `pr-review-triage` uses for PR state, one level
up. A file in the repo root rides into the next `git add .`, and git history is
not asked to keep review state.

```bash
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/code-review"
SLUG=$(git remote get-url origin 2>/dev/null | sed -E 's#^.*[:/]([^/]+)/([^/]+)$#\1/\2#; s#\.git$##')
BRANCH=$(git branch --show-current)
OUT="$STATE/${SLUG:-$(basename "$(git rev-parse --show-toplevel)")}/${BRANCH:-$(git rev-parse --short HEAD)}"
mkdir -p "$OUT"                                   # the report: $OUT/code-review.md
```

No remote → the directory name stands in for `<owner>/<repo>`; detached HEAD →
the short sha stands in for the branch. A re-run on the same branch overwrites
the previous report.

Write `$OUT/code-review.md` and end with a line that is exactly `REVIEW: CLEAN`
or `REVIEW: FINDINGS` — an automated step downstream usually reads it.

**A caller that asks for another file name or another closing line wins**: write
to their name and close with their marker instead of these. The format below
still holds — what changes is the label, not the content. Without this, a
pipeline node with its own artifact contract would inherit two incompatible
endings and have to choose which one to disobey.

Write the report body in the language the user works in (for Lucas, Brazilian
Portuguese with technical terms in English); the closing marker stays exact.

```markdown
# Code review — <branch> vs <base>

<N> file(s), <M> line(s). Lenses: bugs ×2, rules[, intent].

## Findings (<K>)

### 1. <what is wrong, in one line>
- **Where**: `path/file.ts:42`
- **Why**: <the reason, quoting the rule or the evidence>
- **Confidence**: 90

## Dropped at triage (<J>)
<one line per item with its score — shows what was considered and why it fell>

REVIEW: FINDINGS
```

In the conversation return only the summary: how many findings, their titles,
the file path. The report is meant to be read in the file, not pasted into the
terminal.

## What NOT to flag

This is half the quality of the review. Do not flag:

- **What lint, typecheck or tests catch.** They run in the gate; commenting is
  noise. Do not run the build yourself.
- **A pre-existing problem**, on a line this diff did not touch.
- **Test coverage, unmet spec, weak test.** In a project running the spec-verify
  flow that is the Verifier's job, with its discrimination sensor and
  per-criterion tracing. Duplicating it creates contradictions between layers.
- **Style nitpicks** a senior would not raise in a real review.
- **Your preference** against an established project convention.
- An odd but **clearly intentional** change within scope.
- Something silenced on purpose in the code (`eslint-disable` with a reason,
  etc.).

In genuine doubt, prefer not to flag: the review runs again on the next diff,
but trust lost in it does not come back.

## Headless use

In a pipeline nobody answers. So: ask nothing, write the report, return the
summary. Empty diff or missing base: state the reason and finish without error.
Diff too large: review the highest-risk files (database, money, authentication,
public routes) and **record in the report what was left out** — an honest cut
beats an expensive slicing.
