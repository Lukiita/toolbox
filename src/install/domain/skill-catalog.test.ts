import { describe, expect, it } from 'vitest';

import { describeSkill } from './skill-catalog.mts';
import { treeOf } from './skill-tree.fixtures.ts';

const FRONTMATTER = (description: string): string =>
  ['---', 'name: x', `description: ${description}`, '---', '', '# X', ''].join('\n');

describe('describeSkill - the summary', () => {
  it('is the first sentence of the description in SKILL.md', () => {
    const tree = treeOf({
      'SKILL.md': FRONTMATTER(
        'Reviews the branch diff against its base. Use when asked for a review.',
      ),
    });
    expect(describeSkill(tree).summary).toBe('Reviews the branch diff against its base.');
  });

  it('is cut at 80 characters, on a word, when the first sentence runs longer', () => {
    const long = `${'word '.repeat(30)}end.`;
    const { summary } = describeSkill(treeOf({ 'SKILL.md': FRONTMATTER(long) }));
    expect(summary).toBe(`${'word '.repeat(15).trim()}...`);
    expect(summary.length).toBeLessThanOrEqual(80);
  });

  it('reads a description written in quotes', () => {
    const tree = treeOf({ 'SKILL.md': FRONTMATTER('"SQL that stays fast. More."') });
    expect(describeSkill(tree).summary).toBe('SQL that stays fast.');
  });

  it('is empty for a skill with no description, or no SKILL.md', () => {
    expect(describeSkill(treeOf({ 'SKILL.md': '# X\n' })).summary).toBe('');
    expect(describeSkill(treeOf({ 'notes.md': 'x' })).summary).toBe('');
  });
});

describe('describeSkill - the skills it needs', () => {
  it('names every sibling a file of the skill reaches, once, sorted', () => {
    const tree = treeOf({
      'SKILL.md': 'run `python3 <skill-dir>/../capability-sync/scripts/capabilities.py check`',
      'references/verify.md':
        'load `<skill-dir>/../sql-quality/references/query-shape.md`; see `<skill-dir>/../capability-sync/SKILL.md`',
    });
    expect(describeSkill(tree).needs).toEqual(['capability-sync', 'sql-quality']);
  });

  it('needs nothing when it reaches only its own files', () => {
    const tree = treeOf({ 'SKILL.md': 'run `python3 <skill-dir>/scripts/validate.py`' });
    expect(describeSkill(tree).needs).toEqual([]);
  });

  it('does not take a placeholder for a skill', () => {
    const tree = treeOf({ 'SKILL.md': 'a sibling skill is `<skill-dir>/../<name>/`' });
    expect(describeSkill(tree).needs).toEqual([]);
  });

  it('does not read binary files', () => {
    const tree = treeOf({ 'font.bin': '\0<skill-dir>/../sql-quality/x' });
    expect(describeSkill(tree).needs).toEqual([]);
  });
});
