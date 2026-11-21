import { type LocalState, type UpstreamState } from '../domain/skill-state.mts';
import type { FileDiff, SkillFolders, SkillPaths } from './ports.mts';
/** The project's side: the domain's states, plus the two a symlink in the skill's place adds. */
export type InspectedLocal = LocalState | 'pinned' | 'linked';
export interface SkillInspection {
    name: string;
    /** The recorded toolbox version; undefined when the manifest does not know the skill. */
    version: string | undefined;
    local: InspectedLocal;
    upstream: UpstreamState;
    /** Files the project changed, for an edited skill the package did not move. */
    alteredFiles: string[];
    /** Files the package changed, for an unedited skill with a new version waiting. */
    behindFiles: string[];
    /** Files that differ between project and package when both moved: whose change is not known here. */
    divergedFiles: string[];
    paths: SkillPaths;
}
export interface InspectSkillsOptions {
    folders: SkillFolders;
    /** The version of the running toolbox. */
    version: string;
}
/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ folders, version: '2.1.0' })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'current', alteredFiles: ['SKILL.md'], ... }]
 */
export declare function inspectSkills(options: InspectSkillsOptions): SkillInspection[];
/**
 * The diffs behind one inspection. An edit reads from the package (the
 * original) to the project; a waiting version, and files where both moved,
 * read from the project to the package.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export declare function skillDiffs(inspection: SkillInspection, diffFiles: FileDiff): string[];
