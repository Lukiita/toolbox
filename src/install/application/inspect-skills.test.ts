import { rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseReleaseNumber as v } from '../domain/toolbox-version.mts';

import { scratchDirs } from '../infra/scratch-dirs.fixtures.ts';

import { inspectSkills, type SkillInspection, skillDiffs } from './inspect-skills.mts';
import { scratchProject, type ScratchProject, SKILL_V1, writeFiles } from './install.fixtures.ts';

const scratch = scratchDirs('toolbox-install-');

function inspect(project: ScratchProject, version = '1.2.0'): Record<string, SkillInspection> {
  const inspections = inspectSkills({ folders: project.folders, version: v(version) });
  return Object.fromEntries(inspections.map((inspection) => [inspection.name, inspection]));
}

const IN_JAVA = SKILL_V1.replace('first rule', 'first rule, in Java');

/** `code-review` installed at 1.2.0, its SKILL.md edited, and a package that now ships a new smells.md. */
function editedAndBehind(): ScratchProject {
  const project = scratchProject(scratch());
  project.install('1.2.0');
  writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);
  project.ship('code-review', { 'SKILL.md': SKILL_V1, 'references/smells.md': 'smells v2\n' });
  return project;
}

describe('inspectSkills', () => {
  it('reads a freshly installed skill as intact and current, at its recorded version', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    expect(inspect(project).retro).toMatchObject({
      name: 'retro',
      version: v('1.2.0'),
      local: 'intact',
      upstream: 'current',
      alteredFiles: [],
      behindFiles: [],
      divergedFiles: [],
    });
  });

  it('lists the skills by name, shipped and recorded alike', () => {
    const project = scratchProject(scratch());
    project.install();
    rmSync(join(project.packageDir, 'skills', 'retro'), { recursive: true });
    project.ship('zeta', { 'SKILL.md': 'z' });
    const names = inspectSkills({ folders: project.folders, version: v('1.2.0') }).map(
      (i) => i.name,
    );
    expect(names).toEqual(['code-review', 'retro', 'zeta']);
  });

  it('names the files the project edited, added and deleted', () => {
    const project = scratchProject(scratch());
    project.install();
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);
    writeFiles(project.local('code-review'), { 'references/java.md': 'j' });
    rmSync(project.local('code-review/references/smells.md'));

    expect(inspect(project)['code-review']).toMatchObject({
      local: 'altered',
      upstream: 'current',
      alteredFiles: ['SKILL.md', 'references/java.md', 'references/smells.md'],
      behindFiles: [],
    });
  });

  it('reads as behind a skill the package ships with other content, naming the files', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    project.ship('code-review', { 'SKILL.md': SKILL_V1, 'references/smells.md': 'smells v2\n' });

    expect(inspect(project, '1.3.0')['code-review']).toMatchObject({
      version: v('1.2.0'),
      local: 'intact',
      upstream: 'behind',
      alteredFiles: [],
      behindFiles: ['references/smells.md'],
    });
  });

  // With no copy of the original in the project, whose change each file
  // carries cannot be told here: the files that differ are listed as one set.
  it('reads an edited skill with a new version waiting as altered and behind, files not told apart', () => {
    const project = editedAndBehind();

    expect(inspect(project, '1.3.0')['code-review']).toMatchObject({
      local: 'altered',
      upstream: 'behind',
      alteredFiles: [],
      behindFiles: [],
      divergedFiles: ['SKILL.md', 'references/smells.md'],
    });
  });

  // The case the two commands once answered differently: the project already
  // holds the new version, the manifest still names the old one.
  it('agrees with install about a skill the project already brought to the new version', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    const revised = SKILL_V1.replace('last rule', 'last rule, revised');
    project.ship('code-review', { 'SKILL.md': revised, 'references/smells.md': 'smells v1\n' });
    writeFileSync(project.local('code-review/SKILL.md'), revised);

    expect(inspect(project, '1.3.0')['code-review']).toMatchObject({
      local: 'intact',
      upstream: 'current',
      alteredFiles: [],
      behindFiles: [],
      divergedFiles: [],
    });
    expect(project.install('1.3.0')[0]).toMatchObject({ name: 'code-review', status: 'unchanged' });
  });

  it('reads a deleted skill as removed', () => {
    const project = scratchProject(scratch());
    project.install();
    rmSync(project.local('retro'), { recursive: true });
    expect(inspect(project).retro).toMatchObject({ local: 'removed', upstream: 'current' });
  });

  it('reads a recorded skill the package no longer ships as retired', () => {
    const project = scratchProject(scratch());
    project.install();
    rmSync(join(project.packageDir, 'skills', 'retro'), { recursive: true });
    expect(inspect(project).retro).toMatchObject({ local: 'intact', upstream: 'retired' });
  });

  it('reads a skill recorded by a newer toolbox as ahead, not behind', () => {
    const project = scratchProject(scratch());
    project.ship('retro', { 'SKILL.md': 'new\n' });
    project.install('1.3.0');
    project.ship('retro', { 'SKILL.md': 'hello\n' });
    expect(inspect(project, '1.2.0').retro).toMatchObject({
      local: 'intact',
      upstream: 'ahead',
      behindFiles: [],
      divergedFiles: [],
    });
  });

  it('reads a shipped skill the project never installed as not installed', () => {
    const project = scratchProject(scratch());
    expect(inspect(project).retro).toMatchObject({
      version: undefined,
      local: 'not-installed',
      upstream: 'untracked',
    });
  });

  it("reads the project's own folder, link and a link-era link each as what it is", () => {
    const project = scratchProject(scratch());
    project.ship('pinned-one', { 'SKILL.md': 'p' });
    writeFiles(project.local('retro'), { 'SKILL.md': 'mine' });
    writeFiles(join(project.projectRoot, 'my-skills', 'pinned-one'), { 'SKILL.md': 'pin' });
    symlinkSync('../../my-skills/pinned-one', project.local('pinned-one'), 'dir');
    symlinkSync(
      '../../node_modules/@lukiita/toolbox/skills/code-review',
      project.local('code-review'),
      'dir',
    );

    const inspections = inspect(project);

    expect(inspections.retro.local).toBe('unmanaged');
    expect(inspections['pinned-one'].local).toBe('pinned');
    expect(inspections['code-review'].local).toBe('linked');
    expect(inspections['code-review'].upstream).toBe('untracked');
  });

  it('never fetches a release: it reads only what is on the machine', () => {
    const project = editedAndBehind();
    inspect(project, '1.3.0');
    expect(project.releases.asked).toEqual([]);
  });
});

describe('skillDiffs', () => {
  interface Asked {
    from: string;
    to: string;
    fromText: string | undefined;
    toText: string | undefined;
  }
  function asking(inspection: SkillInspection): Asked[] {
    const asked: Asked[] = [];
    const diffs = skillDiffs(inspection, (from, to) => {
      asked.push({
        from: from.label,
        to: to.label,
        fromText: from.content?.toString(),
        toText: to.content?.toString(),
      });
      return 'a diff';
    });
    expect(diffs).toEqual(asked.map(() => 'a diff'));
    return asked;
  }

  it("diffs an edited file from the package's content, which is the original, to the project's", () => {
    const project = scratchProject(scratch());
    project.install();
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);

    expect(asking(inspect(project)['code-review'])).toEqual([
      {
        from: 'toolbox/code-review/SKILL.md',
        to: '.agents/skills/code-review/SKILL.md',
        fromText: SKILL_V1,
        toText: IN_JAVA,
      },
    ]);
  });

  it("diffs a waiting file from the project's content, which is the original, to the package's", () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    project.ship('code-review', { 'SKILL.md': SKILL_V1, 'references/smells.md': 'smells v2\n' });

    expect(asking(inspect(project, '1.3.0')['code-review'])).toEqual([
      {
        from: '.agents/skills/code-review/references/smells.md',
        to: 'toolbox/code-review/references/smells.md',
        fromText: 'smells v1\n',
        toText: 'smells v2\n',
      },
    ]);
  });

  it('diffs every differing file from the project to the package when both moved', () => {
    const project = editedAndBehind();
    const asked = asking(inspect(project, '1.3.0')['code-review']);
    expect(asked.map(({ from, to }) => [from, to])).toEqual([
      ['.agents/skills/code-review/SKILL.md', 'toolbox/code-review/SKILL.md'],
      [
        '.agents/skills/code-review/references/smells.md',
        'toolbox/code-review/references/smells.md',
      ],
    ]);
  });

  // The skill's `references` folder is a link to somewhere else: the project's
  // tree does not hold its files, so they are absent - never read through it.
  it('takes a file behind a link inside the skill as absent, and reads nothing through it', () => {
    const project = scratchProject(scratch());
    project.install();
    writeFiles(join(project.projectRoot, '..', 'outside'), { 'smells.md': 'TOP-SECRET\n' });
    rmSync(project.local('code-review/references'), { recursive: true });
    symlinkSync(
      join(project.projectRoot, '..', 'outside'),
      project.local('code-review/references'),
      'dir',
    );

    const asked = asking(inspect(project)['code-review']);

    expect(asked).toEqual([
      {
        from: 'toolbox/code-review/references/smells.md',
        to: '.agents/skills/code-review/references/smells.md',
        fromText: 'smells v1\n',
        toText: undefined,
      },
    ]);
  });

  it('has nothing to diff for an intact, current skill', () => {
    const project = scratchProject(scratch());
    project.install();
    expect(asking(inspect(project).retro)).toEqual([]);
  });
});

describe('inspectSkills - a skill that cannot be read', () => {
  // `install` reports such a skill and goes on; `skills` stopped before
  // printing anything, for every skill (found in review).
  it('is reported unreadable, with the reason, and the other skills are still inspected', () => {
    const project = scratchProject(scratch());
    project.install();
    writeFiles(project.local('code-review'), { 'bad\\name.md': 'x' });

    const inspections = inspect(project);

    expect(inspections['code-review']).toMatchObject({ local: 'unreadable', upstream: 'unknown' });
    expect(inspections['code-review'].reason).toMatch(
      /^skill file path: received "bad\\\\name\.md"/,
    );
    expect(inspections.retro).toMatchObject({ local: 'intact', upstream: 'current' });
  });
});
