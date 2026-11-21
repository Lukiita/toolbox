import type { CatalogEntry, SkillSelection } from '../application/install-skills.mts';
/** Every skill the package ships. */
export declare const ALL_FLAG = "--all";
/**
 * Write a merge that left conflicts. Named once: the install line that
 * suggests the flag reads it from here, so the hint cannot outlive a rename.
 */
export declare const WRITE_CONFLICTS_FLAG = "--write-conflicts";
/** A mistake in what was typed; the CLI answers with exit code 2. */
export declare class InstallUsageError extends Error {
}
export interface InstallArguments extends SkillSelection {
    writeConflicts: boolean;
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
 * The skills the package ships, one per line with a line about each: what a
 * script or an agent is shown when a project has no skill yet and named none.
 * (A person at a terminal gets the picker, `skill-picker.mts`.)
 *
 * @example
 *   catalogLines(catalog, '2.0.0').forEach((line) => console.error(line))
 */
export declare function catalogLines(catalog: readonly CatalogEntry[], version: string): string[];
