#!/bin/sh
# quality-gate pre-push hook - the ratchet before the push instead of after CI.
#
# Install: copy to `.husky/pre-push` (or `.git/hooks/pre-push`), make it
# executable, review the ADAPT lines. Needs `origin/<base>` fetched.
#
# Why pre-push and not pre-commit: the ratchet measures the WHOLE repository,
# not the diff. Charging it on every commit would fail on files nobody touched -
# the opposite of the pre-commit criterion, which is scoped to the stage on
# purpose. Once per push is the right grain: it is the same measurement CI will
# make minutes later. Slow feedback inverts the incentive: with the job red and
# the code already published, re-freezing is the cheap path and fixing is the
# expensive one.
#
# Why `--baseline-from` and not the local json: CI compares against the PR's
# base. A hook that reads the branch's own `quality-baseline.json` goes green
# after a re-freeze on the branch while CI stays red - green local, red remote,
# worse than no gate, because it teaches people to ignore the local one
# (project-d, 2026-09-11). So the hook measures against the same point CI
# does: the TIP of the base branch (`ci.example.yml` passes the PR's base sha,
# which is the tip at event time), not the merge-base. The two differ when the
# base re-froze after the fork - against the merge-base the hook would pass on
# the older number while CI fails on the newer one (found in review, round 2).
#
# What the hook charges is the DECISION, not the number: a worsening whose
# re-freeze is recorded in `quality-baseline.json` by THIS branch (diffed from
# the merge-base, so a re-freeze on the base does not count as yours) passes
# with a warning, as long as the code is no worse than what was frozen; an
# unrecorded one blocks. See README "When a metric worsens on purpose".
#
# Husky runs hooks with `sh -e`; a bare `.git/hooks/pre-push` does not. The
# script sets `-e` itself so both installs behave the same: any bare command
# that fails aborts, and every command that may legitimately fail below is
# guarded with `||` or sits in a condition, so the fallbacks stay reachable.

BASE_BRANCH="${QUALITY_BASE_BRANCH:-main}" # ADAPT: the branch PRs merge into
# ADAPT: `yarn quality` works as is; npm needs the `--` or it eats the flags
# as its own config and the gate runs with none - against the branch's own
# baseline, silently green.
QUALITY_CMD="pnpm quality" # npm: "npm run quality --"
# ADAPT: add `--skip-tests` when coverage is not gated in the baseline
# (project-d) or the suite is too slow for a push. With it, the coverage
# numbers come from whatever `--coverage` run is on disk - stale or absent on
# a fresh clone - which is why the safe default runs the suite.
GATE_FLAGS=""
CODE_GLOBS="*.ts *.mts *.cts *.tsx *.js *.mjs *.cjs *.jsx"

# The globs must reach git as patterns. Without this, `*.ts` expands against
# the repo root - the README puts `vitest.quality.config.ts` there - and a push
# touching only `src/**` reads as "no code", silently skipping the gate.
set -ef

EMPTY=0000000000000000000000000000000000000000
# Inside .git, not a shared /tmp: per repository, and nobody else can plant
# a file under the name first.
REPORT_DIR=$(git rev-parse --git-dir)
REPORT="$REPORT_DIR/quality-gate-pre-push.md"
REPORT_OWN="$REPORT_DIR/quality-gate-pre-push-own.md"

# Git feeds one line per ref on stdin: <local ref> <local sha> <remote ref> <remote sha>.
# A push that changes no code would measure the same number as before -
# a documentation push does not pay for the gate.
touches_code() {
  # A sha git cannot resolve (force-push over unfetched commits, pruned remote)
  # would make the diff error out and read as "no code". Fail closed: measure.
  git cat-file -e "$1^{commit}" 2>/dev/null || return 0
  git cat-file -e "$2^{commit}" 2>/dev/null || return 0
  git diff --name-only "$1" "$2" -- $CODE_GLOBS | grep -q .
}

pushes_code() {
  while read -r _ local_sha _ remote_sha; do
    [ "$local_sha" = "$EMPTY" ] && continue # branch deletion
    if [ "$remote_sha" = "$EMPTY" ]; then
      # New branch on the remote: no "before" to diff against, use the base.
      before=$(git merge-base "origin/$BASE_BRANCH" "$local_sha" 2>/dev/null) || return 0
    else
      before="$remote_sha"
    fi
    touches_code "$before" "$local_sha" && return 0
  done
  return 1
}

# run_gate <report> [gate args...]  - 0 when the gate passed, 1 when it found
# regressions. A gate that died before writing the report (usage error, missing
# coverage file, missing package manager) is not a regression: say so and stop,
# instead of printing a stale report from an earlier push as if it were this one.
run_gate() {
  report="$1"
  shift
  rm -f "$report"
  $QUALITY_CMD $GATE_FLAGS "$@" --out "$report" >/dev/null 2>&1 && return 0
  [ -f "$report" ] && return 1
  echo "quality gate: the gate exited before writing a report - not a regression, a crash."
  echo "Run it by hand to see the error:  $QUALITY_CMD $GATE_FLAGS $*"
  exit 1
}

# Only the part that matters: which metrics regressed. The full report runs past
# 300 lines (every `any`, every over-complex function) and would bury it. The
# block is delimited by markers report.mts emits, not by the localized heading.
print_regressions() {
  awk '/^<!-- regressions -->$/ { on = 1; next } /^<!-- \/regressions -->$/ { on = 0 } on' "$1"
  echo ""
  echo "Full report: $1"
}

pushes_code || exit 0

# Two revisions with two jobs: the TIP is what the gate measures against (the
# same point CI uses); the MERGE-BASE is where "did this branch re-freeze"
# starts - diffed from the tip, a re-freeze on the base would read as yours.
BASE_SHA=$(git rev-parse --verify "origin/$BASE_BRANCH^{commit}" 2>/dev/null) || BASE_SHA=""
FORK_SHA=$(git merge-base "$BASE_SHA" HEAD 2>/dev/null) || FORK_SHA=""
if [ -z "$BASE_SHA" ] || [ -z "$FORK_SHA" ]; then
  echo "quality gate: origin/$BASE_BRANCH not found - comparing against the branch's own baseline."
  echo "(fetch it to measure against the same point CI does)"
  echo "Quality gate (~5s)..."
  run_gate "$REPORT" && exit 0
  print_regressions "$REPORT"
  exit 1
fi

echo "Quality gate against origin/$BASE_BRANCH (~5s)..."
run_gate "$REPORT" --baseline-from "$BASE_SHA" && exit 0

print_regressions "$REPORT"

if ! git diff --quiet "$FORK_SHA" HEAD -- quality-baseline.json; then
  # The re-freeze is recorded. Charge that it covers the worsening: against the
  # branch's own baseline the gate must pass, or the code got worse than what
  # was frozen.
  if run_gate "$REPORT_OWN"; then
    cat <<'WARN'
────────────────────────────────────────────────────────────────────────────
Regression against the base, but quality-baseline.json was re-frozen on this
branch - a recorded decision. Push allowed.

The quality job on this PR will be RED: it compares against the base, and
the base holds the old number. That is expected on a PR whose job is the
re-freeze. If this is a feature PR, split the re-freeze into its own PR on
the base, merge it, and rebase this one.
────────────────────────────────────────────────────────────────────────────
WARN
    exit 0
  fi
  echo ""
  echo "quality-baseline.json was re-frozen on this branch, but the code got worse than what was frozen:"
  print_regressions "$REPORT_OWN"
  exit 1
fi

# Quoted heredoc delimiter: the text has backticks, which an unquoted heredoc
# would run as command substitution.
cat <<'ADVICE'
────────────────────────────────────────────────────────────────────────────
The quality gate failed. CI will fail the same way - cheaper to fix here.

Before re-freezing, check WHOSE worsening it is: quality-baseline.json travels
in the commit, and if the base re-froze after your branch left, you are
measuring against a stale number. Rebase onto the base and measure again.

If the worsening is yours, fix the code. `--update-baseline` is a deliberate
act, with the reason in the commit body, in a PR of its own: the ratchet only
exists while re-freezing is more expensive than fixing.
────────────────────────────────────────────────────────────────────────────
ADVICE
exit 1
