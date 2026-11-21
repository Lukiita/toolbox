import type { SkillFolders } from './ports.mts';
/** Which skills the caller asked for, beyond the ones the project already has. */
export interface SkillSelection {
    /** Skills named one by one. */
    names: string[];
    /** Every skill the package ships. */
    all: boolean;
}
export interface CatalogEntry {
    name: string;
    /** One line about the skill; empty when it has no description. */
    summary: string;
}
/**
 * The skills the package ships, each with a line about it: what a person
 * picks from.
 *
 * @example
 *   skillCatalog(folders) // => [{ name: 'code-review', summary: 'Reviews the branch diff…' }, ...]
 */
export declare function skillCatalog(folders: SkillFolders): CatalogEntry[];
/**
 * Whether the project already has skills from the toolbox: a manifest with
 * records, or a link the 1.x install wrote.
 *
 * @example
 *   hasInstalledSkills(folders) // => false in a project that never ran install
 */
export declare function hasInstalledSkills(folders: SkillFolders): boolean;
/**
 * Whether somebody has to be asked which skills the project gets: it has
 * none yet, and the command named none. With skills already there, a plain
 * install just brings them up to date.
 *
 * @example
 *   needsSelection({ names: [], all: false }, folders) // => true in a fresh project
 */
export declare function needsSelection(asked: SkillSelection, folders: SkillFolders): boolean;
