#!/bin/sh
# The quality ratchet before the push - copy to `.husky/pre-push`.
#
# All the logic lives in the package (`toolbox pre-push`, src/pre-push/): it
# measures against the tip of origin/<base> like CI, and charges the recorded
# decision, not the number. `quality.baseBranch` in toolbox.config.ts names
# the base. Git's stdin (the pushed refs) passes straight through.
#
# The binary by path, not `pnpm exec`: husky runs hooks in a non-interactive
# sh that never reads the login profile, so a version-managed pnpm may be off
# PATH there; node_modules/.bin only needs `node`.
TOOLBOX="$(git rev-parse --show-toplevel)/node_modules/.bin/toolbox"
[ -x "$TOOLBOX" ] || { echo "pre-push: $TOOLBOX not found - is @lukiita/toolbox installed at the repo root? (pnpm install)" >&2; exit 1; }
"$TOOLBOX" pre-push
