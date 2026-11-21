import type { SkillSelection } from '../application/install-skills.mts';
/** `toolbox install`: every skill the package ships. */
export declare const ALL_FLAG = "--all";
/**
 * `toolbox install`: write a merge that left conflicts. Named once: the
 * install line that suggests the flag reads it from here, so the hint cannot
 * outlive a rename.
 */
export declare const WRITE_CONFLICTS_FLAG = "--write-conflicts";
/** `toolbox skills`: print the diffs behind each state. */
export declare const DIFF_FLAG = "--diff";
/** A mistake in what was typed; the CLI answers with exit code 2. */
export declare class SkillCommandUsageError extends Error {
}
export interface InstallArguments extends SkillSelection {
    writeConflicts: boolean;
}
export interface SkillsArguments {
    diff: boolean;
}
/**
 * Reads `toolbox install [--all] [--write-conflicts] [<skill>...]`.
 *
 * @example
 *   parseInstallArguments(['code-review', '--write-conflicts'])
 *   // => { names: ['code-review'], all: false, writeConflicts: true }
 */
export declare function parseInstallArguments(args: readonly string[]): InstallArguments;
/**
 * Reads `toolbox skills [--diff]`. The command takes no skill names.
 *
 * @example
 *   parseSkillsArguments(['--diff']) // => { diff: true }
 */
export declare function parseSkillsArguments(args: readonly string[]): SkillsArguments;
