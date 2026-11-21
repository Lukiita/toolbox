import type { TextMerge } from '../domain/merge-skill-trees.mts';
import { type SkillStatus } from '../domain/reconcile-skill.mts';
import { type SkillRoots } from '../infra/skill-layout.mts';
/** A past release of the toolbox, fetched: its package folder, or why it could not be had. */
export type FetchedRelease = {
    fetched: true;
    packageDir: string;
} | {
    fetched: false;
    reason: string;
};
/**
 * Where the original of an edited skill is read from: the release the
 * manifest names. A port, because it leaves the machine (`git-past-releases.mts`).
 */
export interface PastReleases {
    fetch(version: string): FetchedRelease;
    /** Removes what `fetch` downloaded. */
    dispose(): void;
}
export interface InstallSkillsOptions extends SkillRoots {
    /** The version of the running toolbox, from its package.json. */
    version: string;
    /** Write a merge that left conflicts, markers included (`--write-conflicts`). */
    writeConflicts: boolean;
    mergeText: TextMerge;
    pastReleases: PastReleases;
    /**
     * Told about each skill as soon as it is settled. The CLI prints from here,
     * so a run that fails on a later skill has already said what it did.
     */
    onReport?: (report: SkillInstallReport) => void;
}
export type InstallStatus = SkillStatus | 'pinned' | 'retired';
export interface SkillInstallReport {
    name: string;
    status: InstallStatus;
    /** The files a merge settled or could not settle. */
    files: string[];
    /** Why, when the status alone does not say (`no-original`). */
    reason?: string;
}
/**
 * Brings the project's `.agents/skills/` up to what the package ships,
 * without losing an edit the project made. Idempotent.
 *
 * @example
 *   installSkills({ packageDir, projectRoot: '/p', version: '2.0.0', writeConflicts: false, mergeText: gitTextMerge, pastReleases })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, ...]
 */
export declare function installSkills(options: InstallSkillsOptions): SkillInstallReport[];
