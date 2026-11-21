import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { treeOf } from '../domain/skill-tree.fixtures.ts';
import { scratchDirs } from './scratch-dirs.fixtures.ts';
import {
  readShippedSkillTree,
  readSkillTree,
  recoverSkillFolder,
  shippedSkills,
  skillLinkKind,
  swapSkillFolder,
  writeSkillTree,
} from './skill-directory.mts';

const scratch = scratchDirs('toolbox-skill-dir-');

/** Gives back write access to every folder a test locked, so the scratch folder can be removed. */
function unlock(root: string): void {
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) chmodSync(join(entry.parentPath, entry.name), 0o755);
  }
}

function put(root: string, path: string, text: string): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), text);
}

describe('shippedSkills', () => {
  it('lists only folders with a SKILL.md, sorted', () => {
    const packageDir = scratch();
    put(packageDir, 'skills/retro/SKILL.md', 'r');
    put(packageDir, 'skills/code-review/SKILL.md', 'c');
    mkdirSync(join(packageDir, 'skills', 'not-a-skill'));
    put(packageDir, 'skills/README.md', 'a file, not a folder');
    expect(shippedSkills(packageDir)).toEqual(['code-review', 'retro']);
  });

  it('is empty for a package with no skills folder', () => {
    expect(shippedSkills(scratch())).toEqual([]);
  });
});

describe('readSkillTree', () => {
  it('reads every file of the folder, nested ones by their "/" path', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', '# retro');
    put(root, 'retro/references/deep/note.md', 'n');
    const read = readSkillTree(join(root, 'retro'));
    expect(read?.paths()).toEqual(['SKILL.md', 'references/deep/note.md']);
    expect(read?.file('references/deep/note.md')?.content.toString()).toBe('n');
  });

  it('is undefined when there is no folder', () => {
    const root = scratch();
    put(root, 'a-file', 'x');
    expect(readSkillTree(join(root, 'absent'))).toBeUndefined();
    expect(readSkillTree(join(root, 'a-file'))).toBeUndefined();
  });

  it('carries the exec bit of a script', () => {
    const root = scratch();
    put(root, 'retro/scripts/run.py', 'print(1)');
    put(root, 'retro/SKILL.md', 'x');
    chmodSync(join(root, 'retro/scripts/run.py'), 0o755);
    const read = readSkillTree(join(root, 'retro'));
    expect(read?.file('scripts/run.py')?.executable).toBe(true);
    expect(read?.file('SKILL.md')?.executable).toBe(false);
  });

  // Running a skill's Python script leaves these behind in the project's
  // copy; counted, every skill with a script would read as edited.
  it('leaves out what running a script or opening the folder leaves behind', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'x');
    put(root, 'retro/scripts/__pycache__/run.cpython-312.pyc', 'bytecode');
    put(root, 'retro/scripts/stray.pyc', 'bytecode');
    put(root, 'retro/.DS_Store', 'finder');
    expect(readSkillTree(join(root, 'retro'))?.paths()).toEqual(['SKILL.md']);
  });
});

describe('readShippedSkillTree', () => {
  // The installed package has no test_*.py (package.json's `files`); a tag
  // fetched by git and a checkout of this repo do. Read alike, the three
  // give one hash - or a fetched original would never match its record.
  it('reads a skill the same from a package and from a git tree that still has its test files', () => {
    const root = scratch();
    put(root, 'packed/SKILL.md', 'x');
    put(root, 'packed/scripts/validate.py', 'v');
    put(root, 'tree/SKILL.md', 'x');
    put(root, 'tree/scripts/validate.py', 'v');
    put(root, 'tree/scripts/test_validate.py', 't');
    put(root, 'tree/scripts/__pycache__/validate.cpython-312.pyc', 'bytecode');
    const tree = readShippedSkillTree(join(root, 'tree'));
    expect(tree?.paths()).toEqual(['SKILL.md', 'scripts/validate.py']);
    expect(tree?.hash).toBe(readShippedSkillTree(join(root, 'packed'))?.hash);
  });

  it('leaves out exactly what package.json keeps out of the package', () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', '..', '..', 'package.json'), 'utf8'),
    ) as { files: string[] };
    // A new exclusion here needs the same exclusion in NOT_PACKAGED or LEFTOVER.
    expect(manifest.files.filter((entry) => entry.startsWith('!skills/'))).toEqual([
      '!skills/**/test_*.py',
      '!skills/**/__pycache__',
    ]);
  });

  it("keeps a test file in the project's own copy: there it is the project's file", () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'x');
    put(root, 'retro/scripts/test_mine.py', 't');
    expect(readSkillTree(join(root, 'retro'))?.paths()).toEqual([
      'SKILL.md',
      'scripts/test_mine.py',
    ]);
  });

  it('is undefined when there is no folder', () => {
    expect(readShippedSkillTree(join(scratch(), 'absent'))).toBeUndefined();
  });
});

describe('writeSkillTree', () => {
  it('creates the folder, parents included, with the files of the tree', () => {
    const root = scratch();
    const dir = join(root, '.agents', 'skills', 'retro');
    writeSkillTree(dir, treeOf({ 'SKILL.md': '# retro', 'references/a.md': 'a' }));
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe('# retro');
    expect(readFileSync(join(dir, 'references', 'a.md'), 'utf8')).toBe('a');
  });

  it('replaces the folder: a file the tree does not have is gone', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'old');
    put(root, 'retro/references/dropped.md', 'd');
    writeSkillTree(join(root, 'retro'), treeOf({ 'SKILL.md': 'new' }));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('new');
    expect(existsSync(join(root, 'retro', 'references'))).toBe(false);
  });

  it('writes a script with its exec bit and a document without it', () => {
    const root = scratch();
    const dir = join(root, 'retro');
    writeSkillTree(dir, treeOf({ 'SKILL.md': 'x', 'scripts/run.py': 'p' }, ['scripts/run.py']));
    expect(statSync(join(dir, 'scripts', 'run.py')).mode & 0o111).not.toBe(0);
    expect(statSync(join(dir, 'SKILL.md')).mode & 0o111).toBe(0);
  });

  it('leaves nothing beside the folder: no staging, no swapped-out copy', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'old');
    put(root, 'retro.toolbox-staging/leftover.md', 'from a dead run');
    writeSkillTree(join(root, 'retro'), treeOf({ 'SKILL.md': 'x' }));
    expect(readdirSync(root)).toEqual(['retro']);
    expect(existsSync(join(root, 'retro', 'leftover.md'))).toBe(false);
  });

  // A script run as root in a container leaves a __pycache__ the user cannot
  // delete. The reader does not count it, so the skill reads intact and gets
  // replaced: the replacement must not stop half-way on it.
  it('replaces the folder even when part of the old one cannot be deleted', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'old');
    put(root, 'retro/scripts/__pycache__/run.pyc', 'bytecode');
    const locked = join(root, 'retro', 'scripts', '__pycache__');
    chmodSync(locked, 0o555);
    try {
      writeSkillTree(join(root, 'retro'), treeOf({ 'SKILL.md': 'new' }));
      expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('new');
      // Whatever could not be deleted must not look like a second skill.
      const beside = readdirSync(root).filter((entry) => entry !== 'retro');
      expect(beside.filter((entry) => existsSync(join(root, entry, 'SKILL.md')))).toEqual([]);
      // And it must not block the next write.
      writeSkillTree(join(root, 'retro'), treeOf({ 'SKILL.md': 'newer' }));
      expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('newer');
    } finally {
      unlock(root);
    }
  });

  it('writes an empty tree as an empty folder', () => {
    const root = scratch();
    writeSkillTree(join(root, 'retro'), treeOf({}));
    expect(readSkillTree(join(root, 'retro'))?.paths()).toEqual([]);
  });

  it('reads back exactly what it wrote', () => {
    const root = scratch();
    const written = treeOf({ 'SKILL.md': 'x', 'scripts/run.py': 'p' }, ['scripts/run.py']);
    writeSkillTree(join(root, 'retro'), written);
    expect(readSkillTree(join(root, 'retro'))?.hash).toBe(written.hash);
  });
});

describe('swapSkillFolder', () => {
  it('puts the old folder back, whole, when the new one cannot be moved in', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'old');
    put(root, 'retro/references/a.md', 'a');
    expect(() => swapSkillFolder(join(root, 'no-such-staging'), join(root, 'retro'))).toThrow(
      /ENOENT/,
    );
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('old');
    expect(readFileSync(join(root, 'retro', 'references', 'a.md'), 'utf8')).toBe('a');
    expect(readdirSync(root)).toEqual(['retro']);
  });

  it('moves the new folder in when there was none before', () => {
    const root = scratch();
    put(root, 'staging/SKILL.md', 'new');
    swapSkillFolder(join(root, 'staging'), join(root, 'retro'));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('new');
    expect(readdirSync(root)).toEqual(['retro']);
  });
});

describe('recoverSkillFolder', () => {
  // A run killed between the two renames of the swap: the folder is beside
  // its place, whole. Read as it is, the skill would be "deleted by the
  // project" and never installed again.
  it('puts back a folder a dead run left swapped out', () => {
    const root = scratch();
    put(root, 'retro.toolbox-old/SKILL.md', 'mine');
    put(root, 'retro.toolbox-old/references/a.md', 'a');
    recoverSkillFolder(join(root, 'retro'));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('mine');
    expect(readdirSync(root)).toEqual(['retro']);
  });

  it('clears a staging folder a dead run left, which agents would list as a skill', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'mine');
    put(root, 'retro.toolbox-staging/SKILL.md', 'half written');
    recoverSkillFolder(join(root, 'retro'));
    expect(readdirSync(root)).toEqual(['retro']);
  });

  it('does not take leftovers of an old folder for the skill', () => {
    const root = scratch();
    put(root, 'retro.toolbox-old/scripts/__pycache__/run.pyc', 'what could not be deleted');
    recoverSkillFolder(join(root, 'retro'));
    expect(existsSync(join(root, 'retro'))).toBe(false);
  });

  it('touches nothing when the folder is in place', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'mine');
    recoverSkillFolder(join(root, 'retro'));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('mine');
  });

  it('has nothing to do in a project with no skills folder yet', () => {
    const root = scratch();
    recoverSkillFolder(join(root, '.agents', 'skills', 'retro'));
    expect(existsSync(join(root, '.agents'))).toBe(false);
  });
});

describe('skillLinkKind', () => {
  function project(): { projectRoot: string; packageDir: string; dest: string } {
    const projectRoot = join(scratch(), 'project');
    const packageDir = join(projectRoot, 'node_modules', '@lukiita', 'toolbox');
    put(packageDir, 'skills/retro/SKILL.md', 'r');
    mkdirSync(join(projectRoot, '.agents', 'skills'), { recursive: true });
    return { projectRoot, packageDir, dest: join(projectRoot, '.agents', 'skills', 'retro') };
  }

  it('is "none" for a real folder and for nothing at all', () => {
    const { dest, packageDir } = project();
    expect(skillLinkKind(dest, packageDir)).toBe('none');
    mkdirSync(dest);
    expect(skillLinkKind(dest, packageDir)).toBe('none');
  });

  it('is "ours" for the link an earlier `toolbox install` wrote', () => {
    const { dest, packageDir } = project();
    symlinkSync('../../node_modules/@lukiita/toolbox/skills/retro', dest, 'dir');
    expect(skillLinkKind(dest, packageDir)).toBe('ours');
  });

  // `pnpm dlx` and `npx` run the toolbox from a cache, while the link still
  // points at the copy in the project's node_modules.
  it('is "ours" for that link even when the toolbox runs from another place', () => {
    const { dest } = project();
    const elsewhere = join(scratch(), 'cache', 'toolbox');
    put(elsewhere, 'skills/retro/SKILL.md', 'r');
    symlinkSync('../../node_modules/@lukiita/toolbox/skills/retro', dest, 'dir');
    expect(skillLinkKind(dest, elsewhere)).toBe('ours');
  });

  it('is "ours" for a link into the running package, wherever that is', () => {
    const { dest } = project();
    const checkout = join(scratch(), 'toolbox');
    put(checkout, 'skills/retro/SKILL.md', 'r');
    symlinkSync(join(checkout, 'skills', 'retro'), dest, 'dir');
    expect(skillLinkKind(dest, checkout)).toBe('ours');
  });

  it('is "ours" for a dangling link: it is nobody\'s pin', () => {
    const { dest, packageDir } = project();
    symlinkSync('../../gone/retro', dest, 'dir');
    expect(skillLinkKind(dest, packageDir)).toBe('ours');
  });

  it('is "pinned" for a link the project made to somewhere else', () => {
    const { projectRoot, dest, packageDir } = project();
    mkdirSync(join(projectRoot, 'my-skills', 'retro'), { recursive: true });
    symlinkSync('../../my-skills/retro', dest, 'dir');
    expect(skillLinkKind(dest, packageDir)).toBe('pinned');
  });

  it('is "pinned" for a link into a sibling package whose name only shares our prefix', () => {
    const { projectRoot, dest, packageDir } = project();
    put(projectRoot, 'node_modules/@lukiita/toolbox-extra/skills/retro/SKILL.md', 'x');
    symlinkSync('../../node_modules/@lukiita/toolbox-extra/skills/retro', dest, 'dir');
    expect(skillLinkKind(dest, packageDir)).toBe('pinned');
  });

  it('resolves the link from where it really lives when .agents/skills is itself a link', () => {
    const { projectRoot, packageDir } = project();
    const elsewhere = join(projectRoot, '..', 'elsewhere', 'skills');
    mkdirSync(elsewhere, { recursive: true });
    rmSync(join(projectRoot, '.agents', 'skills'), { recursive: true });
    symlinkSync('../../elsewhere/skills', join(projectRoot, '.agents', 'skills'), 'dir');
    mkdirSync(join(projectRoot, '..', 'mine', 'retro'), { recursive: true });
    symlinkSync('../../mine/retro', join(elsewhere, 'retro'), 'dir');
    expect(skillLinkKind(join(projectRoot, '.agents', 'skills', 'retro'), packageDir)).toBe(
      'pinned',
    );
  });
});
