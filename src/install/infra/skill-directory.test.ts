import {
  chmodSync,
  existsSync,
  lstatSync,
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

  it("is undefined for a link in the folder's place: nothing is read through it", () => {
    const root = scratch();
    put(root, 'elsewhere/SKILL.md', 'x');
    symlinkSync(join(root, 'elsewhere'), join(root, 'retro'), 'dir');
    expect(readSkillTree(join(root, 'retro'))).toBeUndefined();
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

  // Node's own recursive listing follows a link to a folder; read that way,
  // files from outside the skill entered its tree, its diff and its merges.
  it('never follows a symbolic link, to a folder or to a file', () => {
    const root = scratch();
    put(root, 'outside/private.txt', 'not part of any skill');
    put(root, 'retro/SKILL.md', 'x');
    symlinkSync('../outside', join(root, 'retro', 'linked'), 'dir');
    symlinkSync('../outside/private.txt', join(root, 'retro', 'linked.txt'));
    expect(readSkillTree(join(root, 'retro'))?.paths()).toEqual(['SKILL.md']);
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

  // A staging folder holds a SKILL.md: left behind by a write that failed,
  // agents list it as a second skill until the next install.
  it('leaves no staging folder behind when the write fails, and the old folder whole', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'old');
    const unwritable = treeOf({
      'SKILL.md': 'new',
      [`${'x'.repeat(300)}.md`]: 'a name no disk takes',
    });
    expect(() => writeSkillTree(join(root, 'retro'), unwritable)).toThrow(/ENAMETOOLONG/);
    expect(readdirSync(root)).toEqual(['retro']);
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('old');
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
  /** What a write killed between its two renames leaves: the old folder aside, a marker naming it, the new one in staging. */
  function deadWrite(root: string, aside = 'retro.toolbox-old'): void {
    put(root, `${aside}/SKILL.md`, 'mine');
    put(root, `${aside}/references/a.md`, 'a');
    put(root, 'retro.toolbox-staging/SKILL.md', 'the new one, never moved in');
    writeFileSync(join(root, 'retro.toolbox-swap'), aside);
  }

  // Read as it is, that skill would be "deleted by the project".
  it('puts back the folder a dead write swapped out, and clears the rest', () => {
    const root = scratch();
    deadWrite(root);
    recoverSkillFolder(join(root, 'retro'));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('mine');
    expect(readdirSync(root)).toEqual(['retro']);
  });

  // Leftovers of older writes sit beside it under later names; picked by
  // name order, the wrong one came back and the real one was deleted next.
  it('puts back the folder the write itself named, not a leftover beside it', () => {
    const root = scratch();
    deadWrite(root);
    put(
      root,
      'retro.toolbox-old-1/scripts/__pycache__/run.pyc',
      'what an older write could not delete',
    );
    recoverSkillFolder(join(root, 'retro'));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('mine');
    expect(existsSync(join(root, 'retro', 'scripts'))).toBe(false);
  });

  // Killed after the second rename and before the marker went: the new folder
  // is in place, and the old one beside it still has a SKILL.md agents list.
  it('clears the old folder a write that had finished left with its marker', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'the new one, in place');
    put(root, 'retro.toolbox-old/SKILL.md', 'the old one');
    writeFileSync(join(root, 'retro.toolbox-swap'), 'retro.toolbox-old');
    recoverSkillFolder(join(root, 'retro'));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('the new one, in place');
    expect(readdirSync(root)).toEqual(['retro']);
  });

  // The marker is a file in the repository: one of any size can be committed.
  it('ignores a marker too large to be one, without reading it', () => {
    const root = scratch();
    put(root, 'retro.toolbox-old/SKILL.md', 'old');
    put(root, 'retro.toolbox-staging/SKILL.md', 'staging');
    writeFileSync(join(root, 'retro.toolbox-swap'), `retro.toolbox-old${' '.repeat(5000)}`);
    recoverSkillFolder(join(root, 'retro'));
    expect(existsSync(join(root, 'retro'))).toBe(false);
    expect(existsSync(join(root, 'retro.toolbox-swap'))).toBe(false);
  });

  it('clears a staging folder a dead run left, which agents would list as a skill', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'mine');
    put(root, 'retro.toolbox-staging/SKILL.md', 'half written');
    recoverSkillFolder(join(root, 'retro'));
    expect(readdirSync(root)).toEqual(['retro']);
  });

  // An old folder that could not be deleted is still whole, and the project
  // later deleted the skill. No marker: the write that left it had finished.
  it('does not take an old folder that could not be deleted for a dead write', () => {
    const root = scratch();
    put(root, 'retro.toolbox-old/SKILL.md', 'the version before the last update');
    recoverSkillFolder(join(root, 'retro'));
    expect(existsSync(join(root, 'retro'))).toBe(false);
  });

  it('does not put anything back over a folder that is in place', () => {
    const root = scratch();
    deadWrite(root);
    put(root, 'retro/SKILL.md', 'in place');
    recoverSkillFolder(join(root, 'retro'));
    expect(readFileSync(join(root, 'retro', 'SKILL.md'), 'utf8')).toBe('in place');
    expect(existsSync(join(root, 'retro.toolbox-swap'))).toBe(false);
  });

  // The marker is a file in the repository: anyone can commit one.
  it.each(['../outside', 'other-skill', 'retro', 'retro.toolbox-old/..'])(
    'ignores a marker naming %j, which is not a swapped-out folder of this skill',
    (named) => {
      const root = scratch();
      put(root, 'outside/SKILL.md', 'not ours');
      put(root, 'other-skill/SKILL.md', 'another skill');
      writeFileSync(join(root, 'retro.toolbox-swap'), named);
      recoverSkillFolder(join(root, 'retro'));
      expect(existsSync(join(root, 'retro'))).toBe(false);
      expect(readFileSync(join(root, 'outside', 'SKILL.md'), 'utf8')).toBe('not ours');
      expect(readFileSync(join(root, 'other-skill', 'SKILL.md'), 'utf8')).toBe('another skill');
    },
  );

  it('has nothing to do in a project with no skills folder yet', () => {
    const root = scratch();
    recoverSkillFolder(join(root, '.agents', 'skills', 'retro'));
    expect(existsSync(join(root, '.agents'))).toBe(false);
  });
});

// A repository can commit a symbolic link under any of the names a write
// uses. Clearing "a staging folder" through one deleted the SKILL.md of
// whatever folder it pointed at, outside the project (found in review).
describe('the folders a write keeps beside a skill - when one is a planted symbolic link', () => {
  function outside(root: string): string {
    put(root, 'outside/SKILL.md', 'a file outside the project');
    put(root, 'outside/notes.md', 'n');
    return join(root, 'outside');
  }
  const untouched = (root: string): void => {
    expect(readFileSync(join(root, 'outside', 'SKILL.md'), 'utf8')).toBe(
      'a file outside the project',
    );
    expect(readFileSync(join(root, 'outside', 'notes.md'), 'utf8')).toBe('n');
  };

  it('removes a link named like a staging folder, and nothing it points at', () => {
    const root = scratch();
    symlinkSync(outside(root), join(root, 'retro.toolbox-staging'), 'dir');
    recoverSkillFolder(join(root, 'retro'));
    untouched(root);
    expect(readdirSync(root)).toEqual(['outside']);
  });

  it('removes a link named like a swapped-out folder, and nothing it points at', () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'old');
    symlinkSync(outside(root), join(root, 'retro.toolbox-old'), 'dir');
    writeSkillTree(join(root, 'retro'), treeOf({ 'SKILL.md': 'new' }));
    untouched(root);
    expect(readdirSync(root).sort()).toEqual(['outside', 'retro']);
  });

  // A link a dead write set aside goes back like a folder would. It is then
  // a link in a skill's place, which a repository could have committed there
  // directly: judged as such by whoever reads next, never read through here.
  it('puts back a link a dead write set aside, and reads nothing through it', () => {
    const root = scratch();
    symlinkSync(outside(root), join(root, 'retro.toolbox-old'), 'dir');
    writeFileSync(join(root, 'retro.toolbox-swap'), 'retro.toolbox-old');
    recoverSkillFolder(join(root, 'retro'));
    expect(lstatSync(join(root, 'retro')).isSymbolicLink()).toBe(true);
    expect(readSkillTree(join(root, 'retro'))).toBeUndefined();
    untouched(root);
  });

  it("writes its marker beside the skill, never through a link under the marker's name", () => {
    const root = scratch();
    put(root, 'retro/SKILL.md', 'old');
    outside(root);
    symlinkSync(join(root, 'outside', 'notes.md'), join(root, 'retro.toolbox-swap'));
    writeSkillTree(join(root, 'retro'), treeOf({ 'SKILL.md': 'new' }));
    untouched(root);
    expect(readdirSync(root).sort()).toEqual(['outside', 'retro']);
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
