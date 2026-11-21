// The line-level three-way merge, done by git (`git merge-file`). Git is
// already what the CLI needs to find the repo root, and its merge is the one
// every reader of a conflict marker knows - writing a diff3 here would be a
// second algorithm to keep right.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TextMerge, TextMergeResult, TextSides } from '../domain/merge-skill-trees.mts';
import { GIT_OUTPUT_LIMIT } from './git-output-limit.mts';

// `--diff3` writes the base between the two sides of a conflict: whoever
// resolves it sees what each side changed, not only where they ended up.
const MERGE_FILE = ['merge-file', '-p', '--diff3', '-L', 'project', '-L', 'base', '-L', 'toolbox'];

// git's contract: 0 = merged clean, 1..127 = that many conflicts (capped),
// anything else (255, or no status when git did not start) = no merge.
const MOST_CONFLICTS = 127;

function isMergeAnswer(status: number | null): status is number {
  return status !== null && status >= 0 && status <= MOST_CONFLICTS;
}

function runMergeFile(dir: string): TextMergeResult {
  const run = spawnSync('git', [...MERGE_FILE, 'ours', 'base', 'theirs'], {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT,
  });
  if (!isMergeAnswer(run.status)) {
    // No stderr means git never started; the spawn error says why.
    const reason = (run.stderr || String(run.error)).trim();
    throw new Error(`git merge-file failed (exit ${run.status}): ${reason}`);
  }
  return { text: run.stdout, conflicted: run.status > 0 };
}

/**
 * Merges `theirs` into `ours` from their common `base`.
 *
 * @example
 *   gitTextMerge({ base, ours, theirs }) // => { text: '…', conflicted: false }
 */
export const gitTextMerge: TextMerge = (sides: TextSides): TextMergeResult => {
  const dir = mkdtempSync(join(tmpdir(), 'toolbox-merge-'));
  try {
    for (const [name, text] of Object.entries(sides)) writeFileSync(join(dir, name), text);
    return runMergeFile(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
