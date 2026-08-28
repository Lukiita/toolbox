#!/usr/bin/env bash
#
# Deterministic verdict gate: the contract and the PR only happen for a change
# whose PERSISTED report approves. Grep, not model judgement — an agent talks
# itself into "it's fine"; a grep does not.
#
# Usage:  verdict-gate.sh <report-path> <tlc|fix>
#
# Two modes exist because the two verifiers write different formats, and each
# format is read by the gate that goes with it:
#
#   tlc  → `.specs/features/<slug>/validation.md`, line `**Overall**: ✅ Ready`
#          (report versioned on the branch, written to be read by a human)
#   fix  → `$ARTIFACTS_DIR/verification.md`, line `VERDICT: PASS`
#          (run artifact, gone with the run)
#
# Unifying the two formats would be a contract change on the verifiers, not
# deduplication — so the script accepts both instead of forcing one.
set -euo pipefail

REPORT="${1:?usage: verdict-gate.sh <report-path> <tlc|fix>}"
MODE="${2:?usage: verdict-gate.sh <report-path> <tlc|fix>}"

if [ ! -f "$REPORT" ]; then
  echo "No verification report at $REPORT — the verify node must write it." >&2
  exit 1
fi

case "$MODE" in
  tlc)
    APPROVES='^\*\*Overall\*\*:.*✅ Ready'
    SHOW='^\*\*Overall\*\*:'
    CONTEXT_LINES=0
    ;;
  fix)
    APPROVES='^VERDICT: PASS'
    SHOW='^VERDICT:'
    CONTEXT_LINES=20
    ;;
  *)
    echo "Unknown mode: '$MODE' (expected 'tlc' or 'fix')." >&2
    exit 1
    ;;
esac

if grep -Eq "$APPROVES" "$REPORT"; then
  echo "verdict-gate ok: $REPORT approves"
  exit 0
fi

echo "verdict-gate: $REPORT does not approve — stopping before the contract / PR." >&2
grep -E -A"$CONTEXT_LINES" "$SHOW" "$REPORT" >&2 || true
echo "" >&2
echo "Fix the gaps (see the report) and resume with \`archon workflow resume <run-id>\`," >&2
echo "or resolve interactively. Do NOT re-run with \`workflow run\`: that opens a new run and" >&2
echo "re-pays the whole pipeline (see .archon/WORKFLOWS.md)." >&2
exit 1
