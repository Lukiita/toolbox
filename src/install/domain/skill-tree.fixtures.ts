import { type SkillFile, SkillTree } from './skill-tree.mts';

/**
 * A tree from `{ path: text }`; the paths listed in `executable` carry the exec bit.
 *
 * @example
 *   treeOf({ 'SKILL.md': '# x', 'scripts/run.py': 'print(1)' }, ['scripts/run.py'])
 */
export function treeOf(files: Record<string, string>, executable: string[] = []): SkillTree {
  const entries = Object.entries(files).map(([path, text]): [string, SkillFile] => [
    path,
    { content: Buffer.from(text), executable: executable.includes(path) },
  ]);
  return SkillTree.of(entries);
}
