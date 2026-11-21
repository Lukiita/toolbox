import { type LocalState, type UpstreamState } from '../domain/skill-state.mts';
import type { SkillTree } from '../domain/skill-tree.mts';
import type { ReleaseNumber } from '../domain/toolbox-version.mts';
import type { FileDiff, SkillFolders } from './ports.mts';
/** The project's side: the domain's states, plus what a symlink or a read failure adds. */
export type InspectedLocal = LocalState | 'pinned' | 'linked' | 'unreadable';
/** The package's side: the domain's states, or unknown when the skill could not be read. */
export type InspectedUpstream = UpstreamState | 'unknown';
export interface SkillInspection {
    name: string;
    /** The recorded toolbox version; undefined when the manifest does not know the skill. */
    version: ReleaseNumber | undefined;
    local: InspectedLocal;
    upstream: InspectedUpstream;
    /** Files the project changed, for an edited skill the package did not move. */
    alteredFiles: string[];
    /** Files the package changed, for an unedited skill with a new version waiting. */
    behindFiles: string[];
    /** Files that differ between project and package when both moved: whose change is not known here. */
    divergedFiles: string[];
    /** What was read of each side, for the diffs: never read again from disk. */
    sides: {
        local: SkillTree | undefined;
        shipped: SkillTree | undefined;
    };
    /** Why the skill could not be read, for `unreadable`. */
    reason?: string;
}
export interface InspectSkillsOptions {
    folders: SkillFolders;
    /** The version of the running toolbox. */
    version: ReleaseNumber;
}
/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ folders, version: parseReleaseNumber('2.1.0') })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'current', alteredFiles: ['SKILL.md'], ... }]
 */
export declare function inspectSkills(options: InspectSkillsOptions): SkillInspection[];
/**
 * The diffs behind one inspection, from the content already read: a file the
 * project's tree does not hold - absent, or behind a link - is absent. An
 * edit reads from the package (the original) to the project; a waiting
 * version, and files where both moved, read from the project to the package.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export declare function skillDiffs(inspection: SkillInspection, diffFiles: FileDiff): string[];
