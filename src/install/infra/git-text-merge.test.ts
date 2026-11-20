import { describe, expect, it } from 'vitest';

import { gitTextMerge } from './git-text-merge.mts';

const BASE = ['# Skill', '', 'first rule', '', 'middle', '', 'last rule', ''].join('\n');

describe('gitTextMerge', () => {
  it('keeps both edits when they touch different parts of the file', () => {
    const result = gitTextMerge({
      base: BASE,
      ours: BASE.replace('first rule', 'first rule, in Java'),
      theirs: BASE.replace('last rule', 'last rule, revised'),
    });
    expect(result).toEqual({
      conflicted: false,
      text: ['# Skill', '', 'first rule, in Java', '', 'middle', '', 'last rule, revised', ''].join(
        '\n',
      ),
    });
  });

  it('marks the lines both sides edited, naming whose each version is', () => {
    const result = gitTextMerge({
      base: BASE,
      ours: BASE.replace('middle', 'middle, in Java'),
      theirs: BASE.replace('middle', 'middle, revised'),
    });
    expect(result.conflicted).toBe(true);
    expect(result.text).toBe(
      [
        '# Skill',
        '',
        'first rule',
        '',
        '<<<<<<< project',
        'middle, in Java',
        '||||||| base',
        'middle',
        '=======',
        'middle, revised',
        '>>>>>>> toolbox',
        '',
        'last rule',
        '',
      ].join('\n'),
    );
  });

  it('fails with what git said when git cannot merge at all', () => {
    expect(() => gitTextMerge({ base: 'a\0', ours: 'b\0', theirs: 'c\0' })).toThrow(
      /^git merge-file failed \(exit 255\): .*binary/i,
    );
  });
});
