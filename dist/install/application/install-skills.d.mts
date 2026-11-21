import type { TextMerge } from '../domain/merge-skill-trees.mts';
import { type SkillStatus } from '../domain/reconcile-skill.mts';
import type { ReleaseNumber } from '../domain/toolbox-version.mts';
import type { PastReleases, SkillFolders } from './ports.mts';
import type { SkillSelection } from './skill-selection.mts';
export interface InstallSkillsOptions {
    folders: SkillFolders;
    pastReleases: PastReleases;
    mergeText: TextMerge;
    /** The version of the running toolbox, from its package.json. */
    version: ReleaseNumber;
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
/**
 * Brings the skills the project picked up to what the package ships, without
 * losing an edit the project made. Skills already recorded are always
 * settled; `select` adds to them. Idempotent.
 *
 * @example
 *   installSkills({ folders, pastReleases, mergeText: gitTextMerge, version: parseReleaseNumber('2.0.0'), writeConflicts: false, select: { names: ['code-review'], all: false } })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, { name: 'sql-quality', status: 'copied', files: [], reason: 'needed by code-review' }, ...]
 */
export declare function installSkills(options: InstallSkillsOptions): SkillInstallReport[];
