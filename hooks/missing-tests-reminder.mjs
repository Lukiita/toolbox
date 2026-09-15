#!/usr/bin/env node
/**
 * Provider-neutral Stop hook — warns about changed files with logic that have no co-located test.
 *
 * The heuristic lives in `check-missing-tests.mjs` beside this file, the same one CI runs
 * as a blocking gate. Here it is only a warning: never `decision: block`, no state on
 * disk, no counter — there is no way for it to loop.
 *
 * The difference in severity is deliberate. Mid-task the test may be one step away;
 * at the pull request, it is not.
 */
import { listFilesMissingTests } from './check-missing-tests.mjs';

const MAX_LISTED = 10;

async function main() {
  const pending = await listFilesMissingTests();
  if (pending.length === 0) return;

  const listed = pending.slice(0, MAX_LISTED).map((file) => `  • ${file}`);
  const overflow =
    pending.length > MAX_LISTED ? `\n  … and ${pending.length - MAX_LISTED} more` : '';

  process.stdout.write(
    JSON.stringify({
      systemMessage:
        `⚠️  ${pending.length} file(s) with logic changed without a co-located .test.ts:\n` +
        `${listed.join('\n')}${overflow}\n` +
        'CI blocks the pull request on this. Ignore if one is genuinely exempt.',
    }),
  );
}

await main();
