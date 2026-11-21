import { describe, expect, it } from 'vitest';

import { isBinary, sameContent, type SkillFile, SkillTree } from './skill-tree.mts';

function file(text: string, executable = false): SkillFile {
  return { content: Buffer.from(text), executable };
}

describe('SkillTree.hash', () => {
  // The format is a contract with every manifest already written in a
  // project: change it and every skill there reads as "altered". Both
  // literals were computed outside this code, with sha256sum:
  //   printf 'SKILL.md\0%s\n' "$(printf 'hello\n' | sha256sum | cut -d' ' -f1)" | sha256sum
  it('is sha256 over "<path>\\0<sha256 of the file>\\n" for each path', () => {
    const tree = SkillTree.of([['SKILL.md', file('hello\n')]]);
    expect(tree.hash).toBe(
      'sha256:c9a89a84ba57e7d9f7da6fce928f625d9d5705f00cfdb8aa6117dbd8d6d9122a',
    );
  });

  it('takes the paths in code-unit order, whatever order they were given in', () => {
    const tree = SkillTree.of([
      ['scripts/run.sh', file('#!/bin/sh\n')],
      ['SKILL.md', file('hello\n')],
    ]);
    expect(tree.hash).toBe(
      'sha256:869a0ecd446e37eb8949ac5604fafd7e43ada5ccaeba3111bb27d43d76c89484',
    );
  });

  it('reads a CRLF checkout of a text file as the same content', () => {
    const lf = SkillTree.of([['SKILL.md', file('a\nb\n')]]);
    const crlf = SkillTree.of([['SKILL.md', file('a\r\nb\r\n')]]);
    expect(crlf.hash).toBe(lf.hash);
  });

  it('does not normalise line endings inside a binary file', () => {
    const one = SkillTree.of([['font.bin', file('a\0\r\nb')]]);
    const other = SkillTree.of([['font.bin', file('a\0\nb')]]);
    expect(one.hash).not.toBe(other.hash);
  });

  it('ignores the exec bit', () => {
    const plain = SkillTree.of([['run.sh', file('x', false)]]);
    const executable = SkillTree.of([['run.sh', file('x', true)]]);
    expect(executable.hash).toBe(plain.hash);
  });

  it('changes when a file is edited, renamed or added', () => {
    const base = SkillTree.of([['SKILL.md', file('a')]]);
    expect(SkillTree.of([['SKILL.md', file('b')]]).hash).not.toBe(base.hash);
    expect(SkillTree.of([['skill.md', file('a')]]).hash).not.toBe(base.hash);
    expect(
      SkillTree.of([
        ['SKILL.md', file('a')],
        ['extra.md', file('')],
      ]).hash,
    ).not.toBe(base.hash);
  });
});

describe('SkillTree', () => {
  it('lists its paths sorted and hands a file back by path', () => {
    const tree = SkillTree.of([
      ['references/b.md', file('b')],
      ['SKILL.md', file('a', true)],
    ]);
    expect(tree.paths()).toEqual(['SKILL.md', 'references/b.md']);
    expect(tree.file('SKILL.md')).toEqual({ content: Buffer.from('a'), executable: true });
    expect(tree.file('gone.md')).toBeUndefined();
    expect(tree.entries().map(([path]) => path)).toEqual(['SKILL.md', 'references/b.md']);
  });

  it('equals another tree with the same content', () => {
    const one = SkillTree.of([['SKILL.md', file('a')]]);
    expect(one.equals(SkillTree.of([['SKILL.md', file('a')]]))).toBe(true);
    expect(one.equals(SkillTree.of([['SKILL.md', file('b')]]))).toBe(false);
  });

  it('names the files that differ from another tree: edited, missing on either side', () => {
    const one = SkillTree.of([
      ['SKILL.md', file('a')],
      ['same.md', file('s')],
      ['only-here.md', file('x')],
    ]);
    const other = SkillTree.of([
      ['SKILL.md', file('b')],
      ['same.md', file('s')],
      ['only-there.md', file('y')],
    ]);
    expect(one.differingPaths(other)).toEqual(['SKILL.md', 'only-here.md', 'only-there.md']);
  });

  // A tree is written to disk under a skill's folder: a path that climbs out
  // of it would write (or delete) somewhere else in the project.
  it.each(['../outside.md', 'a/../../b.md', '/etc/passwd', '', 'a//b.md', './a.md', 'a\\b.md'])(
    'refuses the path %j, which is not a plain relative path',
    (path) => {
      expect(() => SkillTree.of([[path, file('x')]])).toThrow(
        `skill file path: received ${JSON.stringify(path)}, expected a relative path with "/" separators and no "." or ".." segment`,
      );
    },
  );
});

describe('SkillTree - a path that is both a file and a folder', () => {
  // A merge can ask for it: the project adds a file `notes`, the new version
  // adds `notes/x.md`. No disk can hold both; refused here, the skill fails
  // with a reason instead of an EEXIST from the middle of a write.
  it('is refused, naming the two paths', () => {
    const clash = (): SkillTree =>
      SkillTree.of([
        ['notes', file('mine')],
        ['notes/x.md', file('theirs')],
      ]);
    expect(clash).toThrow(
      'skill file path: "notes" is a file and also the folder of "notes/x.md"; a skill cannot hold both',
    );
  });

  it('is refused at any depth', () => {
    expect(() =>
      SkillTree.of([
        ['a/b', file('x')],
        ['a/b/c/d.md', file('y')],
      ]),
    ).toThrow('skill file path: "a/b" is a file and also the folder of "a/b/c/d.md"');
  });

  it('is not seen in names that only share a prefix', () => {
    const tree = SkillTree.of([
      ['notes', file('x')],
      ['notes.md', file('y')],
      ['notes-old/a.md', file('z')],
    ]);
    expect(tree.paths()).toEqual(['notes', 'notes-old/a.md', 'notes.md']);
  });
});

describe('sameContent', () => {
  it('compares two files by content, line endings aside', () => {
    expect(sameContent(file('a\n'), file('a\r\n'))).toBe(true);
    expect(sameContent(file('a'), file('b'))).toBe(false);
  });

  it('treats an absent file as equal only to another absent one', () => {
    expect(sameContent(undefined, undefined)).toBe(true);
    expect(sameContent(undefined, file(''))).toBe(false);
  });
});

describe('isBinary', () => {
  it('is true for content with a NUL byte', () => {
    expect(isBinary(Buffer.from('a\0b'))).toBe(true);
    expect(isBinary(Buffer.from('plain text'))).toBe(false);
  });
});
