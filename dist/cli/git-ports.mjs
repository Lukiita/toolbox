// The real git behind the pre-push decision. Every call that may fail returns
// undefined/false instead of throwing: the decision function treats "unknown"
// as "measure", never as "skip".
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
export function baseTip(root, baseBranch) {
    return git(root, ['rev-parse', '--verify', `origin/${baseBranch}^{commit}`])?.trim();
}
export function mergeBase(root, a, b) {
    return git(root, ['merge-base', a, b])?.trim();
}
export function hasCommit(root, sha) {
    return git(root, ['cat-file', '-e', `${sha}^{commit}`]) !== undefined;
}
export function touchesCode(root, from, to) {
    const out = git(root, ['diff', '--name-only', from, to, '--', ...CODE_GLOBS]);
    return out === undefined || out.trim() !== '';
}
export function baselineChanged(root, from, to) {
    const out = git(root, ['diff', '--name-only', from, to, '--', BASELINE_FILE]);
    return out === undefined || out.trim() !== '';
}
export function headSha(root) {
    return git(root, ['rev-parse', 'HEAD'])?.trim() ?? 'HEAD';
}
/** The repo root from anywhere inside it; the cwd when not in a repo. */
export function repoRoot(cwd) {
    return git(cwd, ['rev-parse', '--show-toplevel'])?.trim() ?? cwd;
}
/** Inside `.git/`, not a shared /tmp: per repository, nobody else can plant a file there first. */
export function gitDir(root) {
    return git(root, ['rev-parse', '--absolute-git-dir'])?.trim() ?? root;
}
