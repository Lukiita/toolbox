import { SkillTree } from '../domain/skill-tree.vo.mts';
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
 * Makes the folder hold exactly the tree. Written beside it first and swapped
 * in, so a run that dies half-way leaves the old folder whole, not a mix.
 *
 * @example
 *   writeSkillTree('/p/.agents/skills/retro', shipped)
 */
export declare function writeSkillTree(dir: string, tree: SkillTree): void;
/** `ours`: written by the link-era install, or dangling. `pinned`: the project's own link. */
export type SkillLinkKind = 'none' | 'ours' | 'pinned';
/**
 * What kind of symlink sits where a skill goes, if any.
 *
 * @example
 *   skillLinkKind('/p/.agents/skills/retro', packageDir) // => 'ours' after a v1 install
 */
export declare function skillLinkKind(dest: string, packageDir: string): SkillLinkKind;
