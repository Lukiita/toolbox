// The real git behind the pre-push decision. Every call that may fail returns
// undefined/false instead of throwing, and each one fails in the direction
// that BLOCKS: an unknown "touches code" measures, an unknown "was the
// baseline re-frozen" reads as "not re-frozen" - the branch that blocks. The
// first cut had the second one inverted, and a git failure would have printed
// "a recorded decision, push allowed" (found in review, round 2).

import { BASELINE_FILE } from '../quality-gate/baseline-store.mts';
import { runGit } from '../quality-gate/git.mts';

const CODE_GLOBS = ['*.ts', '*.mts', '*.cts', '*.tsx', '*.js', '*.mjs', '*.cjs', '*.jsx'];

function git(root: string, args: string[]): string | undefined {
  try {
    return runGit(root, args);
  } catch {
    return undefined;
  }
}

/** Sha of `origin/<base>`'s tip, or undefined when it is not fetched. */
export function baseTip(root: string, baseBranch: string): string | undefined {
  return git(root, ['rev-parse', '--verify', `origin/${baseBranch}^{commit}`])?.trim();
}

/** Merge-base of two shas, or undefined when they are unrelated. */
export function mergeBase(root: string, a: string, b: string): string | undefined {
  return git(root, ['merge-base', a, b])?.trim();
}

/** Whether git can resolve `sha` locally. */
export function hasCommit(root: string, sha: string): boolean {
  return git(root, ['cat-file', '-e', `${sha}^{commit}`]) !== undefined;
}

/** Whether a diff between two shas touches code; unknown = yes (measures). */
export function touchesCode(root: string, from: string, to: string): boolean {
  const out = git(root, ['diff', '--name-only', from, to, '--', ...CODE_GLOBS]);
  return out === undefined || out.trim() !== '';
}

/** Whether the branch re-froze the baseline between `from` and `to`; unknown = no (blocks). */
export function baselineChanged(root: string, from: string, to: string): boolean {
  const out = git(root, ['diff', '--name-only', from, to, '--', BASELINE_FILE]);
  return out !== undefined && out.trim() !== '';
}

/** HEAD's sha, or the literal `HEAD` when git cannot answer. */
export function headSha(root: string): string {
  return git(root, ['rev-parse', 'HEAD'])?.trim() ?? 'HEAD';
}

/** The repo root from anywhere inside it; the cwd when not in a repo. */
export function repoRoot(cwd: string): string {
  return git(cwd, ['rev-parse', '--show-toplevel'])?.trim() ?? cwd;
}

/** Inside `.git/`, not a shared /tmp: per repository, nobody else can plant a file there first. */
export function gitDir(root: string): string {
  return git(root, ['rev-parse', '--absolute-git-dir'])?.trim() ?? root;
}
