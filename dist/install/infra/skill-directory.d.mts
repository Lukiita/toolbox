import { SkillTree } from '../domain/skill-tree.mts';
/**
 * Every folder under the package's `skills/` that has a SKILL.md.
 *
 * @example
 *   shippedSkills('/p/node_modules/@lukiita/toolbox') // => ['code-review', 'retro', ...]
 */
export declare function shippedSkills(packageDir: string): string[];
/**
 * Reads a skill's folder in the project; undefined when there is no folder there.
 *
 * @example
 *   readSkillTree('/p/.agents/skills/retro')?.hash // => 'sha256:…'
 */
export declare function readSkillTree(dir: string): SkillTree | undefined;
/**
 * Reads a skill as a release ships it - from the installed package, a
 * checkout or a fetched tag, always the same files.
 *
 * @example
 *   readShippedSkillTree('/p/node_modules/@lukiita/toolbox/skills/retro')?.hash
 */
export declare function readShippedSkillTree(dir: string): SkillTree | undefined;
/**
 * Moves `staging` into the place of `dir`. The old folder is renamed aside,
 * never deleted first: until 2.0's review this was "delete, then rename", and
 * a delete that failed half-way (or a run killed in between) left a skill
 * half-gone that the next install read as the project's own deletions.
 * Each rename is atomic; when the second one fails, the first is undone.
 *
 * @example
 *   swapSkillFolder('/p/.agents/skills/retro.toolbox-staging', '/p/.agents/skills/retro')
 */
export declare function swapSkillFolder(staging: string, dir: string): void;
/**
 * Makes the folder hold exactly the tree. Written beside it first and swapped
 * in, so a failure at any point leaves the old folder whole, not a mix.
 *
 * @example
 *   writeSkillTree('/p/.agents/skills/retro', shipped)
 */
export declare function writeSkillTree(dir: string, tree: SkillTree): void;
/**
 * Undoes what a write that died left behind, before the folder is read: a
 * staging folder (agents would list it as a skill), and a folder swapped out
 * with nothing swapped in - read as it is, that skill would be "deleted by the
 * project" and never installed again.
 *
 * @example
 *   recoverSkillFolder('/p/.agents/skills/retro')
 */
export declare function recoverSkillFolder(dir: string): void;
/** `ours`: written by the link-era install, or dangling. `pinned`: the project's own link. */
export type SkillLinkKind = 'none' | 'ours' | 'pinned';
/**
 * What kind of symlink sits where a skill goes, if any.
 *
 * @example
 *   skillLinkKind('/p/.agents/skills/retro', packageDir) // => 'ours' after a v1 install
 */
export declare function skillLinkKind(dest: string, packageDir: string): SkillLinkKind;
