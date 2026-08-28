#!/usr/bin/env bash
# Fingerprint of the inputs that decide a conflict between the spec and an
# accepted ADR: the feature spec and the decisions in `docs/en/adr/`.
#
# Two nodes of tlc-apply-feature use this. `verify-feature` records the
# fingerprint BEFORE implement; `adr-gate` recomputes it AFTER and compares. A
# different fingerprint means the spec or an ADR changed since the conflict was
# recorded — the `.adr-conflict` marker went stale, and the one that needs to
# re-evaluate is implement, which `--resume` does not re-run.
#
# It lives in one script, not inline in both nodes, because two copies of the
# same hashing logic drift over time — and drifting here reintroduces exactly
# the stale-marker bug it exists to catch.
#
# Usage: .archon/scripts/adr-inputs-fingerprint.sh <feature-slug>
set -euo pipefail

SLUG="${1:?usage: adr-inputs-fingerprint.sh <feature-slug>}"

INPUTS=()
if [ -d docs/en/adr ]; then
  INPUTS+=(docs/en/adr)
fi
if [ -d ".specs/features/$SLUG" ]; then
  INPUTS+=(".specs/features/$SLUG")
fi

# A project with no ADR and no spec on disk: constant fingerprint, and the gate
# compares constant with constant. It does not invent a difference where there
# is no input.
if [ ${#INPUTS[@]} -eq 0 ]; then
  echo "no-inputs"
  exit 0
fi

# The file name enters the hash (sha256sum prints the name beside the digest),
# so renaming or removing an ADR changes the fingerprint — not only editing its
# content.
find "${INPUTS[@]}" -type f -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 -r sha256sum \
  | sha256sum \
  | cut -d' ' -f1
