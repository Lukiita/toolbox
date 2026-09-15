// Copy to the project root as `toolbox.config.ts`. Every field is optional and
// an EMPTY object is the canonical setup - so only write what differs. A value
// copied here equal to the default freezes it in the project: a later change
// of the library's default would not reach it (ADR-0001). The full list of
// fields and defaults: templates/quality-gate/README.md, "Config".
import { defineToolboxConfig } from '@lukiita/toolbox/config';

export default defineToolboxConfig({
  quality: {
    // A monorepo without `src/` re-anchors all three (project-d shape) - the
    // gate refuses a duplicationPaths entry that does not exist, so it cannot
    // silently measure nothing:
    // sourceWindow: /^apps\/[^/]+\/src\//,
    // featureSlot: '^apps/[^/]+/src/(?:([^/]+)/)?',
    // duplicationPaths: ['apps/backend/src', 'libs'],
    // The branch pull requests merge into, when it is not `main`:
    // baseBranch: 'develop',
    // When coverage is not gated, or the suite is too slow for a push:
    // prePushSkipTests: true,
  },
  hooks: {
    // protectedBranches: ['main', 'develop', 'release'],
  },
});
