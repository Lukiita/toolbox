import type { DiffSide, FileDiff } from '../application/ports.mts';
/** What `git diff` left behind: its exit status and its two outputs. */
export interface DiffRun {
    status: number | null;
    stdout: string | Buffer;
    stderr: string | Buffer;
    error?: Error;
}
/**
 * Exit 0 means "equal" and 1 "they differ": both are the answer. Anything
 * else is a failure, said in the output instead of an empty diff that reads
 * as "nothing changed".
 *
 * @example
 *   diffOrFailure({ status: 128, stdout: '', stderr: 'fatal: …' }, from) // => 'could not diff …: fatal: …\n'
 */
export declare function diffOrFailure(run: DiffRun, from: DiffSide): string;
/**
 * A unified diff of two contents, headed by their labels; empty when equal.
 *
 * @example
 *   gitFileDiff({ label: 'toolbox/retro/SKILL.md', content }, { label: '.agents/skills/retro/SKILL.md', content: mine })
 */
export declare const gitFileDiff: FileDiff;
