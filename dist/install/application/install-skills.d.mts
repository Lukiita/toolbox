import type { TextMerge } from '../domain/merge-skill-trees.mts';
import { type SkillStatus } from '../domain/reconcile-skill.mts';
import type { PastReleases, SkillFolders } from './ports.mts';
/** Which skills the caller asked for, beyond the ones the project already has. */
export interface SkillSelection {
    /** Skills named one by one. */
    names: string[];
    /** Every skill the package ships. */
    all: boolean;
}
export interface InstallSkillsOptions {
    folders: SkillFolders;
    pastReleases: PastReleases;
    mergeText: TextMerge;
    /** The version of the running toolbox, from its package.json. */
    version: string;
    /** Write a merge that left conflicts, markers included where the text can carry them. */
    writeConflicts: boolean;
    select: SkillSelection;
    /**
     * Told about each skill as soon as it is settled. The CLI prints from here,
     * so a run that fails on a later skill has already said what it did.
     */
    onReport?: (report: SkillInstallReport) => void;
}
export type InstallStatus = SkillStatus | 'pinned' | 'failed';
export interface SkillInstallReport {
    name: string;
    status: InstallStatus;
    /** The files a merge settled or could not settle. */
    files: string[];
    /** What the status alone does not say: why a skill came along, was kept, or failed. */
    reason?: string;
}
/** A name on the command line that is not a skill the package ships. */
export declare class UnknownSkillError extends Error {
}
/**
 * Brings the skills the project picked up to what the package ships, without
 * losing an edit the project made. Skills already recorded are always
 * settled; `select` adds to them. Idempotent.
 *
 * @example
 *   installSkills({ folders, pastReleases, mergeText: gitTextMerge, version: '2.0.0', writeConflicts: false, select: { names: ['code-review'], all: false } })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, { name: 'sql-quality', status: 'copied', files: [], reason: 'needed by code-review' }, ...]
 */
export declare function installSkills(options: InstallSkillsOptions): SkillInstallReport[];
/**
 * Whether the project already has skills from the toolbox: a manifest with
 * records, or a link the 1.x install wrote. When it has none and asks for
 * none, there is nothing an install can do but ask which ones.
 *
 * @example
 *   hasInstalledSkills(folders) // => false in a project that never ran install
 */
export declare function hasInstalledSkills(folders: SkillFolders): boolean;
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
