/**
 * @example
 *   runGit(root, ['rev-parse', 'HEAD']).trim() // => 'a1b2c3…'
 */
export declare function runGit(root: string, args: readonly string[]): string;
