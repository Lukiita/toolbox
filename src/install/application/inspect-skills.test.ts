import { rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from '../infra/scratch-dirs.fixtures.ts';

import { inspectSkills, type SkillInspection, skillDiffs } from './inspect-skills.mts';
import { scratchProject, type ScratchProject, SKILL_V1, writeFiles } from './install.fixtures.ts';

const scratch = scratchDirs('toolbox-install-');

function inspect(project: ScratchProject, version = '1.2.0'): Record<string, SkillInspection> {
  const { packageDir, projectRoot } = project;
  const inspections = inspectSkills({ packageDir, projectRoot, version });
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
      version: '1.2.0',
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
    const { packageDir, projectRoot } = project;
    const names = inspectSkills({ packageDir, projectRoot, version: '1.2.0' }).map((i) => i.name);
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
      version: '1.2.0',
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
  function asking(inspection: SkillInspection): [string, string][] {
    const asked: [string, string][] = [];
    const diffs = skillDiffs(inspection, (from, to) => {
      asked.push([from, to]);
      return 'a diff';
    });
    expect(diffs).toEqual(asked.map(() => 'a diff'));
    return asked;
  }

  const shipped = (project: ScratchProject, path: string): string =>
    join(project.packageDir, 'skills', path);

  it("diffs an edited file from the package's, which is the original, to the project's", () => {
    const project = scratchProject(scratch());
    project.install();
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);

    expect(asking(inspect(project)['code-review'])).toEqual([
      [shipped(project, 'code-review/SKILL.md'), project.local('code-review/SKILL.md')],
    ]);
  });

  it("diffs a waiting file from the project's, which is the original, to the package's", () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    project.ship('code-review', { 'SKILL.md': SKILL_V1, 'references/smells.md': 'smells v2\n' });

    expect(asking(inspect(project, '1.3.0')['code-review'])).toEqual([
      [
        project.local('code-review/references/smells.md'),
        shipped(project, 'code-review/references/smells.md'),
      ],
    ]);
  });

  it('diffs every file from the project to the package when both moved', () => {
    const project = editedAndBehind();

    expect(asking(inspect(project, '1.3.0')['code-review'])).toEqual([
      [project.local('code-review/SKILL.md'), shipped(project, 'code-review/SKILL.md')],
      [
        project.local('code-review/references/smells.md'),
        shipped(project, 'code-review/references/smells.md'),
      ],
    ]);
  });

  it('has nothing to diff for an intact, current skill', () => {
    const project = scratchProject(scratch());
    project.install();
    expect(asking(inspect(project).retro)).toEqual([]);
  });
});
