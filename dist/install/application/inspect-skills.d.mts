import { type SkillPaths, type SkillRoots } from '../infra/skill-layout.mts';
/** The project's side, against the recorded original. */
export type LocalState = 'intact' | 'altered' | 'removed' | 'not-installed' | 'unmanaged' | 'pinned' | 'linked';
/** The package's side, against the recorded original. */
export type UpstreamState = 'current' | 'behind' | 'ahead' | 'retired' | 'untracked';
export interface SkillInspection {
    name: string;
    /** The recorded toolbox version; undefined when the manifest does not know the skill. */
    version: string | undefined;
    local: LocalState;
    upstream: UpstreamState;
    /** Files that differ between the original and the project's folder. */
    alteredFiles: string[];
    /** Files that differ between the original and what the package ships. */
    behindFiles: string[];
    /** The stored original is gone or was edited: a merge is not possible until it is restored. */
    baseLost: boolean;
    paths: SkillPaths;
}
export interface InspectSkillsOptions extends SkillRoots {
    /** The version of the running toolbox. */
    version: string;
}
/** Diffs two files; a path that does not exist reads as an empty file. */
export type FileDiff = (from: string, to: string) => string;
/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ packageDir, projectRoot: '/p', version: '2.1.0' })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'behind', alteredFiles: ['SKILL.md'], ... }]
 */
export declare function inspectSkills(options: InspectSkillsOptions): SkillInspection[];
/**
 * The diffs behind one inspection: what the project changed, then what the
 * package changed, each against the original.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export declare function skillDiffs(inspection: SkillInspection, diffFiles: FileDiff): string[];
