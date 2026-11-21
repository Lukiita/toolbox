import type { OriginalLookup } from '../domain/reconcile-skill.mts';
import type { SkillManifest } from '../domain/skill-manifest.mts';
import type { SkillTree } from '../domain/skill-tree.mts';
/**
 * A symlink where a skill's folder goes. `ours`: written by the 1.x install,
 * which linked skills instead of copying them, or dangling. `pinned`: the
 * project's own link to somewhere else.
 */
export type SkillLinkKind = 'none' | 'ours' | 'pinned';
export interface SkillPaths {
    local: string;
    shipped: string;
}
/** The skills on disk: the running package's and the project's. */
export interface SkillFolders {
    /** Names of the skills the running package ships, sorted. */
    shipped(): string[];
    /** A skill as the running package ships it; undefined when it ships none by that name. */
    readShipped(name: string): SkillTree | undefined;
    /** The project's folder for a skill; undefined when there is none. */
    readLocal(name: string): SkillTree | undefined;
    /**
     * Makes the project's folder hold exactly the tree. Returns the path of an
     * old folder it could not delete, when there is one.
     */
    writeLocal(name: string, tree: SkillTree): string | undefined;
    linkKind(name: string): SkillLinkKind;
    /** Removes the symlink in a skill's place, never what it points at. */
    removeLink(name: string): void;
    /** Undoes what a write that died left behind, before the folder is read. */
    recover(name: string): void;
    readManifest(): SkillManifest;
    saveManifest(manifest: SkillManifest): void;
    /** Where a skill's two folders are, for whoever prints or diffs them. */
    paths(name: string): SkillPaths;
}
/** The releases of the toolbox already published: where a merge reads an original from. */
export interface PastReleases {
    /** A skill as that release shipped it, or why it could not be read. */
    skill(version: string, name: string): OriginalLookup;
    /** Removes whatever was downloaded. */
    dispose(): void;
}
/** Diffs two files; a path that does not exist reads as an empty file. */
export type FileDiff = (from: string, to: string) => string;
