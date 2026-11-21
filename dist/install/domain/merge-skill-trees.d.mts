import { SkillTree } from './skill-tree.mts';
export interface TextSides {
    base: string;
    ours: string;
    theirs: string;
}
export interface TextMergeResult {
    /** The merged text; with conflict markers when `conflicted`. */
    text: string;
    conflicted: boolean;
}
/**
 * The line-level merge, behind a port: git does it (`infra/git-text-merge.mts`).
 * The strings carry the files' bytes, one per code unit: an implementation
 * may split and join lines, and must hand back every other unit untouched.
 */
export type TextMerge = (sides: TextSides) => TextMergeResult;
export interface TreeSides {
    base: SkillTree;
    ours: SkillTree;
    theirs: SkillTree;
}
export interface TreeMerge {
    tree: SkillTree;
    /** Files both sides edited and the text merge settled. */
    merged: string[];
    /** Files both sides moved and nothing could settle; `tree` holds the project's side. */
    conflicts: string[];
}
/**
 * Merges the new version of a skill into the project's edited copy.
 *
 * @example
 *   mergeSkillTrees({ base, ours: local, theirs: shipped }, gitTextMerge)
 *   // => { tree, merged: ['SKILL.md'], conflicts: [] }
 */
export declare function mergeSkillTrees(sides: TreeSides, mergeText: TextMerge): TreeMerge;
