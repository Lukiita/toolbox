/** Sha of `origin/<base>`'s tip, or undefined when it is not fetched. */
export declare function baseTip(root: string, baseBranch: string): string | undefined;
/** Merge-base of two shas, or undefined when they are unrelated. */
export declare function mergeBase(root: string, a: string, b: string): string | undefined;
/** Whether git can resolve `sha` locally. */
export declare function hasCommit(root: string, sha: string): boolean;
/** Whether a diff between two shas touches code; unknown = yes (measures). */
export declare function touchesCode(root: string, from: string, to: string): boolean;
/** Whether the branch re-froze the baseline between `from` and `to`; unknown = no (blocks). */
export declare function baselineChanged(root: string, from: string, to: string): boolean;
/** HEAD's sha, or the literal `HEAD` when git cannot answer. */
export declare function headSha(root: string): string;
/** The repo root from anywhere inside it; the cwd when not in a repo. */
export declare function repoRoot(cwd: string): string;
/** Inside `.git/`, not a shared /tmp: per repository, nobody else can plant a file there first. */
export declare function gitDir(root: string): string;
