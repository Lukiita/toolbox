import type { SkillLinkKind } from '../application/ports.mts';
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
 * Moves `staging` into the place of `dir`. What is there is renamed aside,
 * never deleted first: until 2.0's review this was "delete, then rename", and
 * a delete that failed half-way (or a run killed in between) left a skill
 * half-gone that the next install read as the project's own deletions.
 * Each rename is atomic; when the second one fails, the first is undone.
 * A marker names the folder set aside while the two renames are under way,
 * so a run killed between them can be undone exactly (`recoverSkillFolder`).
 * Returns the old folder when it could not be deleted afterwards.
 *
 * @example
 *   swapSkillFolder('/p/.agents/skills/retro.toolbox-staging', '/p/.agents/skills/retro')
 */
export declare function swapSkillFolder(staging: string, dir: string): string | undefined;
/**
 * Makes the folder hold exactly the tree. Written beside it first and swapped
 * in, so a failure at any point leaves the old folder whole, not a mix - and
 * no staging folder, which holds a SKILL.md and would be listed as a skill.
 * Returns the old folder when it could not be deleted, for the caller to report.
 *
 * @example
 *   writeSkillTree('/p/.agents/skills/retro', shipped)
 */
export declare function writeSkillTree(dir: string, tree: SkillTree): string | undefined;
/**
 * Undoes a write that died between its two renames, before the folder is
 * read: the old folder is beside its place and the new one never moved in.
 * Read as it is, that skill would be "deleted by the project".
 *
 * The marker the swap wrote says which folder to put back. Without one there
 * was no dead write: an old folder that merely could not be deleted stays
 * where it is. Guessed from the folders present, a leftover was put back in
 * place of the real one, which the next write then deleted (found in review).
 *
 * @example
 *   recoverSkillFolder('/p/.agents/skills/retro')
 */
export declare function recoverSkillFolder(dir: string): void;
/**
 * What kind of symlink sits where a skill goes, if any.
 *
 * @example
 *   skillLinkKind('/p/.agents/skills/retro', packageDir) // => 'ours' after a v1 install
 */
export declare function skillLinkKind(dest: string, packageDir: string): SkillLinkKind;
