export declare function baseTip(root: string, baseBranch: string): string | undefined;
export declare function mergeBase(root: string, a: string, b: string): string | undefined;
export declare function hasCommit(root: string, sha: string): boolean;
export declare function touchesCode(root: string, from: string, to: string): boolean;
export declare function baselineChanged(root: string, from: string, to: string): boolean;
export declare function headSha(root: string): string;
/** The repo root from anywhere inside it; the cwd when not in a repo. */
export declare function repoRoot(cwd: string): string;
/** Inside `.git/`, not a shared /tmp: per repository, nobody else can plant a file there first. */
export declare function gitDir(root: string): string;
