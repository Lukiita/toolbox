// One place that spawns git for the gate. Throws on failure - the callers
// that can tolerate a failure (the pre-push ports) wrap it.

import { execFileSync } from 'node:child_process';

/**
 * @example
 *   runGit(root, ['rev-parse', 'HEAD']).trim() // => 'a1b2c3…'
 */
export function runGit(root: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}
