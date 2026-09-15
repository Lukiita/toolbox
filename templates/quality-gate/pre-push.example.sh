#!/bin/sh
# The quality ratchet before the push - copy to `.husky/pre-push`.
#
# All the logic lives in the package (`toolbox pre-push`, src/pre-push/): it
# measures against the tip of origin/<base> like CI, and charges the recorded
# decision, not the number. `quality.baseBranch` in toolbox.config.ts names
# the base. Git's stdin (the pushed refs) passes straight through.
pnpm exec toolbox pre-push   # npm: npx toolbox pre-push
