import { describe, expect, it } from 'vitest';

import { mergeSkillTrees, type TextMerge, type TextSides } from './merge-skill-trees.mts';
import { treeOf } from './skill-tree.fixtures.ts';
import { type SkillFile, SkillTree } from './skill-tree.mts';

function text(merged: SkillTree, path: string): string | undefined {
  return merged.file(path)?.content.toString('utf8');
}

/** A text merge that must not be reached: the case under test settles without one. */
const neverMerges: TextMerge = (sides) => {
  throw new Error(`unexpected text merge of ${JSON.stringify(sides)}`);
};

/** Records what it was asked and answers with a fixed result. */
function recordingMerge(result: { text: string; conflicted: boolean }): {
  merge: TextMerge;
  asked: TextSides[];
} {
  const asked: TextSides[] = [];
  return {
    asked,
    merge: (sides) => {
      asked.push(sides);
      return result;
    },
  };
}

describe('mergeSkillTrees - one side moved', () => {
  it('takes the upstream content of a file the project did not touch', () => {
    const result = mergeSkillTrees(
      {
        base: treeOf({ 'a.md': 'v1' }),
        ours: treeOf({ 'a.md': 'v1' }),
        theirs: treeOf({ 'a.md': 'v2' }),
      },
      neverMerges,
    );
    expect(text(result.tree, 'a.md')).toBe('v2');
    expect(result.merged).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps the project's edit of a file upstream did not touch", () => {
    const result = mergeSkillTrees(
      {
        base: treeOf({ 'a.md': 'v1' }),
        ours: treeOf({ 'a.md': 'mine' }),
        theirs: treeOf({ 'a.md': 'v1' }),
      },
      neverMerges,
    );
    expect(text(result.tree, 'a.md')).toBe('mine');
    expect(result.conflicts).toEqual([]);
  });

  it('settles without a merge when both sides made the same edit', () => {
    const result = mergeSkillTrees(
      {
        base: treeOf({ 'a.md': 'v1' }),
        ours: treeOf({ 'a.md': 'v2' }),
        theirs: treeOf({ 'a.md': 'v2' }),
      },
      neverMerges,
    );
    expect(text(result.tree, 'a.md')).toBe('v2');
    expect(result.conflicts).toEqual([]);
  });

  it('brings a file upstream added', () => {
    const result = mergeSkillTrees(
      { base: treeOf({}), ours: treeOf({}), theirs: treeOf({ 'new.md': 'n' }, ['new.md']) },
      neverMerges,
    );
    expect(result.tree.file('new.md')).toEqual({ content: Buffer.from('n'), executable: true });
  });

  it('drops a file upstream deleted and the project did not touch', () => {
    const result = mergeSkillTrees(
      { base: treeOf({ 'old.md': 'o' }), ours: treeOf({ 'old.md': 'o' }), theirs: treeOf({}) },
      neverMerges,
    );
    expect(result.tree.paths()).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('keeps a file the project added', () => {
    const result = mergeSkillTrees(
      { base: treeOf({}), ours: treeOf({ 'java.md': 'j' }), theirs: treeOf({}) },
      neverMerges,
    );
    expect(text(result.tree, 'java.md')).toBe('j');
  });

  it('keeps deleted a file the project deleted and upstream did not touch', () => {
    const result = mergeSkillTrees(
      { base: treeOf({ 'ts.md': 't' }), ours: treeOf({}), theirs: treeOf({ 'ts.md': 't' }) },
      neverMerges,
    );
    expect(result.tree.paths()).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});

describe('mergeSkillTrees - both sides moved the same file', () => {
  const sides = {
    base: treeOf({ 'a.md': 'base' }),
    ours: treeOf({ 'a.md': 'ours' }, ['a.md']),
    theirs: treeOf({ 'a.md': 'theirs' }),
  };

  it('asks for a text merge of the three versions and takes a clean result', () => {
    const { merge, asked } = recordingMerge({ text: 'both', conflicted: false });
    const result = mergeSkillTrees(sides, merge);
    expect(asked).toEqual([{ base: 'base', ours: 'ours', theirs: 'theirs' }]);
    expect(text(result.tree, 'a.md')).toBe('both');
    expect(result.merged).toEqual(['a.md']);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps the project's exec bit on a merged file", () => {
    const { merge } = recordingMerge({ text: 'both', conflicted: false });
    expect(mergeSkillTrees(sides, merge).tree.file('a.md')?.executable).toBe(true);
  });

  it('names the file as a conflict when the text merge could not settle it', () => {
    const { merge } = recordingMerge({ text: '<<<<<<< marked', conflicted: true });
    const result = mergeSkillTrees(sides, merge);
    expect(result.conflicts).toEqual(['a.md']);
    expect(result.merged).toEqual([]);
    expect(text(result.tree, 'a.md')).toBe('<<<<<<< marked');
  });

  it("is a conflict that keeps the project's file when upstream deleted what the project edited", () => {
    const result = mergeSkillTrees(
      { base: treeOf({ 'a.md': 'base' }), ours: treeOf({ 'a.md': 'ours' }), theirs: treeOf({}) },
      neverMerges,
    );
    expect(result.conflicts).toEqual(['a.md']);
    expect(text(result.tree, 'a.md')).toBe('ours');
  });

  it('is a conflict that keeps the file deleted when the project deleted what upstream edited', () => {
    const result = mergeSkillTrees(
      { base: treeOf({ 'a.md': 'base' }), ours: treeOf({}), theirs: treeOf({ 'a.md': 'theirs' }) },
      neverMerges,
    );
    expect(result.conflicts).toEqual(['a.md']);
    expect(result.tree.paths()).toEqual([]);
  });

  it("is a conflict that keeps the project's file when both added it with different content", () => {
    const result = mergeSkillTrees(
      { base: treeOf({}), ours: treeOf({ 'a.md': 'ours' }), theirs: treeOf({ 'a.md': 'theirs' }) },
      neverMerges,
    );
    expect(result.conflicts).toEqual(['a.md']);
    expect(text(result.tree, 'a.md')).toBe('ours');
  });

  it("is a conflict that keeps the project's file when the content is binary", () => {
    const result = mergeSkillTrees(
      {
        base: treeOf({ 'f.bin': 'b\0ase' }),
        ours: treeOf({ 'f.bin': 'o\0urs' }),
        theirs: treeOf({ 'f.bin': 't\0heirs' }),
      },
      neverMerges,
    );
    expect(result.conflicts).toEqual(['f.bin']);
    expect(text(result.tree, 'f.bin')).toBe('o\0urs');
  });
});

// The hash reads a CRLF checkout as the same content (skill-tree.mts). The
// merge must read it the same way, or on a Windows checkout every line of
// the project's file differs from the package's and every merge conflicts.
describe('mergeSkillTrees - a project checked out with CRLF', () => {
  const sides = {
    base: treeOf({ 'a.md': 'one\ntwo\nthree\n' }),
    ours: treeOf({ 'a.md': 'one, mine\r\ntwo\r\nthree\r\n' }),
    theirs: treeOf({ 'a.md': 'one\ntwo\nthree, theirs\n' }),
  };

  it('hands the text merge every side with LF line endings', () => {
    const { merge, asked } = recordingMerge({ text: 'merged\n', conflicted: false });
    mergeSkillTrees(sides, merge);
    expect(asked).toEqual([
      {
        base: 'one\ntwo\nthree\n',
        ours: 'one, mine\ntwo\nthree\n',
        theirs: 'one\ntwo\nthree, theirs\n',
      },
    ]);
  });

  it("writes the merged file back with the project's line endings", () => {
    const { merge } = recordingMerge({
      text: 'one, mine\ntwo\nthree, theirs\n',
      conflicted: false,
    });
    const result = mergeSkillTrees(sides, merge);
    expect(text(result.tree, 'a.md')).toBe('one, mine\r\ntwo\r\nthree, theirs\r\n');
  });

  it('leaves LF alone when the project uses LF', () => {
    const { merge } = recordingMerge({ text: 'x\ny\n', conflicted: false });
    const result = mergeSkillTrees(
      {
        base: treeOf({ 'a.md': 'b\n' }),
        ours: treeOf({ 'a.md': 'o\n' }),
        theirs: treeOf({ 'a.md': 't\n' }),
      },
      merge,
    );
    expect(text(result.tree, 'a.md')).toBe('x\ny\n');
  });
});

// The hash reads text byte for byte (latin1). The merge must too: decoded as
// UTF-8, a file saved in Windows-1252 came back with every accent replaced
// by U+FFFD, under the one status that writes over an edited skill.
describe('mergeSkillTrees - a text file that is not UTF-8', () => {
  const latin1 = (text: string): SkillFile => ({
    content: Buffer.from(text, 'latin1'),
    executable: false,
  });

  it('writes back the bytes the merge returned, none rewritten', () => {
    // The merge keeps the project's line, which holds 0xE7 0xE3 ("çã" in latin1).
    const merge: TextMerge = ({ ours, theirs }) => ({
      text: `${ours}${theirs}`,
      conflicted: false,
    });
    const result = mergeSkillTrees(
      {
        base: SkillTree.of([['a.md', latin1('base\n')]]),
        ours: SkillTree.of([['a.md', latin1('descri\u00e7\u00e3o\n')]]),
        theirs: SkillTree.of([['a.md', latin1('theirs\n')]]),
      },
      merge,
    );
    expect(result.tree.file('a.md')?.content).toEqual(
      Buffer.from([
        0x64, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f, 0x0a, 0x74, 0x68, 0x65, 0x69, 0x72,
        0x73, 0x0a,
      ]),
    );
  });

  it('writes a UTF-8 file back as the same UTF-8', () => {
    const merge: TextMerge = ({ ours }) => ({ text: ours, conflicted: false });
    const result = mergeSkillTrees(
      {
        base: treeOf({ 'a.md': 'base\n' }),
        ours: treeOf({ 'a.md': 'descrição\n' }),
        theirs: treeOf({ 'a.md': 'theirs\n' }),
      },
      merge,
    );
    expect(text(result.tree, 'a.md')).toBe('descrição\n');
  });
});

describe('mergeSkillTrees - several files', () => {
  it('settles each file on its own and lists merged and conflicting paths sorted', () => {
    const merge: TextMerge = ({ ours }) => ({ text: `merged ${ours}`, conflicted: ours === 'o-z' });
    const result = mergeSkillTrees(
      {
        base: treeOf({ 'z.md': 'b', 'm.md': 'b', 'untouched.md': 'u', 'up.md': 'v1' }),
        ours: treeOf({ 'z.md': 'o-z', 'm.md': 'o-m', 'untouched.md': 'u', 'up.md': 'v1' }),
        theirs: treeOf({ 'z.md': 't', 'm.md': 't', 'untouched.md': 'u', 'up.md': 'v2' }),
      },
      merge,
    );
    expect(result.merged).toEqual(['m.md']);
    expect(result.conflicts).toEqual(['z.md']);
    expect(text(result.tree, 'm.md')).toBe('merged o-m');
    expect(text(result.tree, 'up.md')).toBe('v2');
    expect(text(result.tree, 'untouched.md')).toBe('u');
  });
});
