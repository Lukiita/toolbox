import type { OriginalLookup } from '../domain/reconcile-skill.mts';
import type { SkillManifest } from '../domain/skill-manifest.mts';
import type { SkillTree } from '../domain/skill-tree.mts';
import type { ReleaseNumber } from '../domain/toolbox-version.mts';
/**
 * A symlink where a skill's folder goes. `ours`: written by the 1.x install,
 * which linked skills instead of copying them, or dangling. `pinned`: the
 * project's own link to somewhere else.
 */
export type SkillLinkKind = 'none' | 'ours' | 'pinned';
/** The skills on disk: the running package's and the project's. */
export interface SkillFolders {
    /** Names of the skills the running package ships, sorted. */
    shipped(): string[];
    /** A skill as the running package ships it; undefined when it ships none by that name. */
    readShipped(name: string): SkillTree | undefined;
    /** The project's folder for a skill; undefined when there is none. */
    readLocal(name: string): SkillTree | undefined;
    /**
     * Makes the project's folder hold exactly the tree, replacing what is in
     * its place - a folder, or a symlink, which is unlinked and never followed.
     * Returns the path of an old folder it could not delete, when there is one.
     */
    writeLocal(name: string, tree: SkillTree): string | undefined;
    linkKind(name: string): SkillLinkKind;
    /** Undoes what a write that died left behind, before the folder is read. */
    recover(name: string): void;
    readManifest(): SkillManifest;
    saveManifest(manifest: SkillManifest): void;
}
/** The releases of the toolbox already published: where a merge reads an original from. */
export interface PastReleases {
    /** A skill as that release shipped it, or why it could not be read. */
    skill(version: ReleaseNumber, name: string): OriginalLookup;
    /** Removes whatever was downloaded. */
    dispose(): void;
}
/** One side of a file diff: the name it is shown under, and its content - undefined when absent. */
export interface DiffSide {
    label: string;
    content: Buffer | undefined;
}
/**
 * Diffs two contents the caller already read. Never paths: handed paths, git
 * opened them in the project, and a link inside a skill pulled files from
 * outside it into the output (found in review).
 */
export type FileDiff = (from: DiffSide, to: DiffSide) => string;
