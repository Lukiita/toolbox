// The real git behind the pre-push decision. Every call that may fail returns
// undefined/false instead of throwing, and each one fails in the direction
// that BLOCKS: an unknown "touches code" measures, an unknown "was the
// baseline re-frozen" reads as "not re-frozen" - the branch that blocks. The
// first cut had the second one inverted, and a git failure would have printed
// "a recorded decision, push allowed" (found in review, round 2).
import { BASELINE_FILE } from "../quality-gate/baseline-store.mjs";
import { runGit } from "../quality-gate/git.mjs";
const CODE_GLOBS = ['*.ts', '*.mts', '*.cts', '*.tsx', '*.js', '*.mjs', '*.cjs', '*.jsx'];
function git(root, args) {
    try {
        return runGit(root, args);
    }
    catch {
        return undefined;
    }
}
/**
 * Sha of `origin/<base>`'s tip, or undefined when it is not fetched.
 *
 * @example
 *   baseTip(root, 'main') // => 'a1b2c3…' | undefined
 */
export function baseTip(root, baseBranch) {
    return git(root, ['rev-parse', '--verify', `origin/${baseBranch}^{commit}`])?.trim();
}
/**
 * Merge-base of two shas, or undefined when they are unrelated.
 *
 * @example
 *   mergeBase(root, tip, 'HEAD') // => the fork point
 */
export function mergeBase(root, a, b) {
    return git(root, ['merge-base', a, b])?.trim();
}
/**
 * Whether git can resolve `sha` locally.
 *
 * @example
 *   hasCommit(root, 'deadbeef') // => false
 */
export function hasCommit(root, sha) {
    return git(root, ['cat-file', '-e', `${sha}^{commit}`]) !== undefined;
}
/**
 * Whether a diff between two shas touches code; unknown = yes (measures).
 *
 * @example
 *   touchesCode(root, before, 'HEAD') // => false for a docs-only push
 */
export function touchesCode(root, from, to) {
    const out = git(root, ['diff', '--name-only', from, to, '--', ...CODE_GLOBS]);
    return out === undefined || out.trim() !== '';
}
/**
 * Whether the branch re-froze the baseline between `from` and `to`; unknown = no (blocks).
 *
 * @example
 *   baselineChanged(root, forkSha, 'HEAD')
 */
export function baselineChanged(root, from, to) {
    const out = git(root, ['diff', '--name-only', from, to, '--', BASELINE_FILE]);
    return out !== undefined && out.trim() !== '';
}
/**
 * HEAD's sha, or the literal `HEAD` when git cannot answer.
 *
 * @example
 *   headSha(root) // => 'a1b2c3…'
 */
export function headSha(root) {
    return git(root, ['rev-parse', 'HEAD'])?.trim() ?? 'HEAD';
}
/**
 * The repo root from anywhere inside it; the cwd when not in a repo.
 *
 * @example
 *   repoRoot('/p/src/x') // => '/p'
 */
export function repoRoot(cwd) {
    return git(cwd, ['rev-parse', '--show-toplevel'])?.trim() ?? cwd;
}
/**
 * Inside `.git/`, not a shared /tmp: per repository, nobody else can plant a file there first.
 *
 * @example
 *   gitDir(root) // => '/p/.git' (or the worktree's git dir)
 */
export function gitDir(root) {
    return git(root, ['rev-parse', '--absolute-git-dir'])?.trim() ?? root;
}
