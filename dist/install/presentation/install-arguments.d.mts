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
 * The list a person picks from, when a project has no skill yet and named none.
 *
 * @example
 *   selectionMenu(catalog, '2.0.0').forEach((line) => console.log(line))
 */
export declare function selectionMenu(catalog: readonly CatalogEntry[], version: string): string[];
/**
 * Reads the answer to the selection menu.
 *
 * @example
 *   parseSelection('1 retro', ['code-review', 'ddd-tactical', 'retro'])
 *   // => { names: ['code-review', 'retro'], all: false }
 */
export declare function parseSelection(answer: string, names: readonly string[]): SkillSelection;
