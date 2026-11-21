// One rule, tested at every place it applies (ADR-0003): nothing the toolbox
// reads or writes in a project goes through a symbolic link at that path. A
// repository is somebody else's content; a link committed under a name the
// toolbox uses must never make `toolbox install` or `toolbox skills` touch
// what it points at. Three reviews in a row found one more such name, each
// fixed alone - this file is the list.

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillManifestError } from '../domain/skill-manifest.mts';
import { scratchDirs } from '../infra/scratch-dirs.fixtures.ts';
import { inspectSkills } from './inspect-skills.mts';
import {
  scratchProject,
  type ScratchProject,
  SKILL_V1,
  statuses,
  writeFiles,
} from './install.fixtures.ts';

const scratch = scratchDirs('toolbox-planted-');

interface Planted {
  project: ScratchProject;
  /** A folder outside the project, with a SKILL.md and a file in it. */
  outside: string;
  /** Fails if anything under `outside` changed, appeared or went missing. */
  expectOutsideUntouched: () => void;
}

function planted(): Planted {
  const root = scratch();
  const project = scratchProject(root);
  const outside = join(root, 'outside');
  writeFiles(outside, { 'SKILL.md': 'not part of the project', 'victim.txt': 'precious' });
  mkdirSync(project.local('.'), { recursive: true });
  return {
    project,
    outside,
    expectOutsideUntouched: () => {
      expect(readdirSync(outside).sort()).toEqual(['SKILL.md', 'victim.txt']);
      expect(readFileSync(join(outside, 'SKILL.md'), 'utf8')).toBe('not part of the project');
      expect(readFileSync(join(outside, 'victim.txt'), 'utf8')).toBe('precious');
    },
  };
}

const linkedByV1 = (project: ScratchProject, name: string): void =>
  symlinkSync(`../../node_modules/@lukiita/toolbox/skills/${name}`, project.local(name), 'dir');

describe('a link planted under a name a write uses beside a skill', () => {
  // The names: <skill>.toolbox-staging, <skill>.toolbox-old[-n], <skill>.toolbox-swap.
  const NAMES = [
    'retro.toolbox-staging',
    'retro.toolbox-old',
    'retro.toolbox-old-1',
    'retro.toolbox-swap',
  ];

  it.each(NAMES)(
    '%s -> a folder: a first install copies the skill and leaves the folder alone',
    (name) => {
      const { project, outside, expectOutsideUntouched } = planted();
      symlinkSync(outside, project.local(name), 'dir');

      expect(statuses(project.install()).retro).toBe('copied');

      expectOutsideUntouched();
      expect(readdirSync(project.local('.')).sort()).toEqual(['code-review', 'retro']);
    },
  );

  it.each(NAMES)('%s -> a file: an update replaces the skill and leaves the file alone', (name) => {
    const { project, outside, expectOutsideUntouched } = planted();
    project.install('1.2.0');
    project.ship('retro', { 'SKILL.md': 'new\n' });
    symlinkSync(join(outside, 'victim.txt'), project.local(name));

    expect(statuses(project.install('1.3.0')).retro).toBe('updated');

    expectOutsideUntouched();
    expect(readFileSync(project.local('retro/SKILL.md'), 'utf8')).toBe('new\n');
  });

  // The case that got through: on this path nothing cleared the marker
  // before it was written, and the file it pointed at was overwritten.
  it.each(NAMES)('%s -> a file: replacing a 1.x link leaves the file alone', (name) => {
    const { project, outside, expectOutsideUntouched } = planted();
    linkedByV1(project, 'retro');
    symlinkSync(join(outside, 'victim.txt'), project.local(name));

    expect(statuses(project.install()).retro).toBe('copied');

    expectOutsideUntouched();
    expect(lstatSync(project.local('retro')).isSymbolicLink()).toBe(false);
  });

  it('a dangling 1.x link with a planted marker: nothing is created where the marker points', () => {
    const { project, outside, expectOutsideUntouched } = planted();
    symlinkSync('../../gone/retro', project.local('retro'), 'dir');
    symlinkSync(join(outside, 'created.txt'), project.local('retro.toolbox-swap'));

    expect(statuses(project.install()).retro).toBe('copied');

    expectOutsideUntouched();
  });
});

describe('a link planted where the manifest goes', () => {
  const manifestOf = (project: ScratchProject): string =>
    join(project.projectRoot, '.agents', 'toolbox-skills.json');
  const REFUSED =
    '.agents/toolbox-skills.json: expected a regular file, found a symbolic link; the manifest is never read or written through one';

  it.each([
    ['a file, which is neither read as a manifest nor written', 'victim.txt'],
    ['nothing, where nothing is then created', 'planted.json'],
  ])('is refused when it points at %s', (_, target) => {
    const { project, outside, expectOutsideUntouched } = planted();
    symlinkSync(join(outside, target), manifestOf(project));

    expect(() => project.install('1.2.0', { select: { names: [], all: true } })).toThrow(
      new SkillManifestError(REFUSED),
    );

    expectOutsideUntouched();
    expect(existsSync(project.local('retro'))).toBe(false);
  });

  it('is refused by `toolbox skills` too', () => {
    const { project, outside } = planted();
    symlinkSync(join(outside, 'victim.txt'), manifestOf(project));
    expect(() => inspectSkills({ folders: project.folders, version: '1.2.0' })).toThrow(REFUSED);
  });
});

describe("a link the project keeps in a skill's place", () => {
  it('is reported pinned and never read through, by install or by skills', () => {
    const { project, outside, expectOutsideUntouched } = planted();
    symlinkSync(outside, project.local('retro'), 'dir');

    expect(statuses(project.install()).retro).toBe('pinned');
    const inspected = inspectSkills({ folders: project.folders, version: '1.2.0' });
    expect(inspected.find(({ name }) => name === 'retro')).toMatchObject({
      local: 'pinned',
      alteredFiles: [],
      divergedFiles: [],
    });

    expectOutsideUntouched();
  });

  // Read through, a link to a large or unreadable folder made `toolbox
  // skills` walk it all, or stop on the first folder it could not open.
  // Root reads anything, so there is nothing to observe as root.
  it.skipIf(process.getuid?.() === 0)(
    'does not make `toolbox skills` open the folder it points at',
    () => {
      const { project, outside } = planted();
      mkdirSync(join(outside, 'locked'));
      chmodSync(join(outside, 'locked'), 0o000);
      symlinkSync(outside, project.local('retro'), 'dir');
      try {
        expect(() => inspectSkills({ folders: project.folders, version: '1.2.0' })).not.toThrow();
      } finally {
        chmodSync(join(outside, 'locked'), 0o755);
      }
    },
  );
});

describe('a write killed while replacing a 1.x link', () => {
  // The link was set aside, the marker names it, the copy is still in staging.
  it('is undone: the link is back, and the next install makes its copy', () => {
    const { project } = planted();
    symlinkSync(
      '../../node_modules/@lukiita/toolbox/skills/retro',
      project.local('retro.toolbox-old'),
      'dir',
    );
    writeFiles(project.local('.'), { 'retro.toolbox-swap': 'retro.toolbox-old' });
    writeFiles(project.local('retro.toolbox-staging'), { 'SKILL.md': SKILL_V1 });

    const reports = project.install();

    expect(statuses(reports).retro).toBe('copied');
    expect(lstatSync(project.local('retro')).isSymbolicLink()).toBe(false);
    expect(readFileSync(project.local('retro/SKILL.md'), 'utf8')).toBe('hello\n');
    expect(readdirSync(project.local('.')).sort()).toEqual(['code-review', 'retro']);
  });
});
