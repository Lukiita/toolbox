import type { TextMerge } from '../domain/merge-skill-trees.mts';
import { type SkillStatus } from '../domain/reconcile-skill.mts';
import { type SkillRoots } from '../infra/skill-layout.mts';
export interface InstallSkillsOptions extends SkillRoots {
    /** The version of the running toolbox, from its package.json. */
    version: string;
    /** Write a merge that left conflicts, markers included (`--write-conflicts`). */
    writeConflicts: boolean;
    mergeText: TextMerge;
}
export type InstallStatus = SkillStatus | 'pinned' | 'retired';
export interface SkillInstallReport {
    name: string;
    status: InstallStatus;
    /** The files a merge settled or could not settle. */
    files: string[];
}
/**
 * Brings the project's `.agents/skills/` up to what the package ships,
 * without losing an edit the project made. Idempotent.
 *
 * @example
 *   installSkills({ packageDir, projectRoot: '/p', version: '2.0.0', writeConflicts: false, mergeText: gitTextMerge })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, ...]
 */
export declare function installSkills(options: InstallSkillsOptions): SkillInstallReport[];
