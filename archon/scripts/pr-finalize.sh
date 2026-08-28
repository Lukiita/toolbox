#!/usr/bin/env bash
#
# Close-out of the workflow that opens a PR: fixes the base if it came out
# wrong, prints the PR and **says what the next command is**.
#
# It was born shared by three `finalize` nodes — the re-target block was
# identical in all three (measured, not assumed; what differed was only the
# artifact list, which stays in each one's YAML). Same extraction as
# `repo-gate.sh` and `verdict-gate.sh`. Since 08/04 the only caller is
# `tlc-apply-feature`: the others left the branch for the pilot and come back
# one per PR (Backlog in `.archon/README.md`). The script stays generic on
# purpose — it is for them to reuse on the way back, not for each to bring a
# copy again.
#
# Why there is a handoff, and why it is not a node:
#
# The review cycle does NOT close when the PR opens. CodeRabbit reviews
# asynchronously and in several passes — measured on PR #39: six reviews over
# 9h46m, the first 13 minutes after creation and the last almost 10 hours
# later, triggered by a new push. There is no instant "the review finished" for
# a node to wait on: waiting for the first hangs the run for 13 minutes and
# still misses the others.
#
# (Solving this inside the run was tried by two paths, both removed: the
# CodeRabbit CLI before the PR, which hung the run and at the plan's limit
# exited 0 without reviewing anything; and a loop waiting for the review inside
# the run. See .archon/WORKFLOWS.md.)
#
# During the `tlc-apply-feature` pilot, treating the findings is MANUAL. There
# was a `tlc-pr-findings` doing that round; it left the branch on 2026-08-04
# together with the other untested flows, and comes back as a skill after the
# golden line is proven — see docs/plano-fluxo-tlc.md.
#
# Needs $BASE_BRANCH in the environment (Archon injects it into bash nodes, and
# the script inherits it from its caller).
set -euo pipefail

HEAD_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# The number comes from WHOEVER OPENED the PR, not from a search: `create-pr`
# records what it created. The search by branch is the fallback for whoever
# calls this script outside a run — and there it demands a unique answer.
#
# Why uniqueness matters here and is not pedantry: GitHub allows more than one
# open PR from the same head to DIFFERENT bases, and the first thing this
# script does is CHANGE THE BASE. A `.[0]` over such a pair re-targets the
# wrong PR — and the damage is exactly what the script exists to fix.
PR_NUMBER=""
if [ -n "${ARTIFACTS_DIR:-}" ] && [ -s "$ARTIFACTS_DIR/.pr-number" ]; then
  PR_NUMBER=$(tr -d '[:space:]' < "$ARTIFACTS_DIR/.pr-number")
fi

if [ -z "$PR_NUMBER" ]; then
  # Assignment, not a pipe: under `set -e` a `gh` failure takes the script down
  # here. Letting it become an empty list would turn an API error into "no open
  # PR", which is an infrastructure lie dressed up as a verdict.
  PR_LIST=$(gh pr list --head "$HEAD_BRANCH" --state open --json number -q '.[].number')
  # Line by line, quoted (SC2206). `MATCHES=($PR_LIST)` would suffer word
  # splitting and globbing — harmless for the integers the API returns, but the
  # next reader would have to re-derive that guarantee. Cheaper not to depend
  # on it. The `-n` keeps the empty case at zero elements, which is what the
  # `0` branch expects: `<<<` over an empty string produces one line.
  MATCHES=()
  while IFS= read -r line; do
    [ -n "$line" ] && MATCHES+=("$line")
  done <<< "$PR_LIST"
  case ${#MATCHES[@]} in
    0)
      echo "No open PR for branch $HEAD_BRANCH" >&2
      exit 1
      ;;
    1)
      PR_NUMBER=${MATCHES[0]}
      ;;
    *)
      echo "More than one open PR for branch $HEAD_BRANCH: ${MATCHES[*]}" >&2
      echo "This script re-targets the base — guessing one of them would touch the wrong PR." >&2
      echo "Close the extra ones, or record the right number in \$ARTIFACTS_DIR/.pr-number." >&2
      exit 1
      ;;
  esac
fi

ACTUAL=$(gh pr view "$PR_NUMBER" --json baseRefName -q '.baseRefName')
if [ "$ACTUAL" != "$BASE_BRANCH" ]; then
  echo "Wrong base on PR #$PR_NUMBER: expected=$BASE_BRANCH actual=$ACTUAL — fixing" >&2
  gh pr edit "$PR_NUMBER" --base "$BASE_BRANCH"
fi

# Assign before printing: `echo "$(gh pr view …)"` returns the status of
# `echo`, so `set -e` does not see the `gh` failure and the close-out goes on
# announcing success with a blank PR line.
PR_URL=$(gh pr view "$PR_NUMBER" --json url -q '.url')
echo "  PR:         $PR_URL"
echo ""
echo "── the cycle has not closed yet ──"
echo "  External review is asynchronous and comes in several passes. CodeRabbit"
echo "  comments on the PR by itself a few minutes after the push."
echo ""
echo "  Treating the findings is MANUAL during the pilot: read the comments on"
echo "  the PR and handle them in an interactive session. Two reminders that"
echo "  hold for people as much as they held for the flow that used to do this:"
echo ""
echo "    - the inline-comments endpoint does NOT return everything. A finding"
echo "      CodeRabbit cannot pin to a diff line becomes text in the review"
echo "      body, under 'Outside diff range comments (N)'. Measured on PR #39:"
echo "      2 of 4 findings only existed there."
echo "    - refusing a finding with a written reason in the thread beats fixing"
echo "      it to zero a counter. Chasing 'zero comments' produces fixes for"
echo "      non-problems."
