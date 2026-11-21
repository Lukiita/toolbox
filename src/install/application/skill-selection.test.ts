import { describe, expect, it } from 'vitest';

import { scratchDirs } from '../infra/scratch-dirs.fixtures.ts';
import { scratchProject, type ScratchProject } from './install.fixtures.ts';
import { hasInstalledSkills, needsSelection, skillCatalog } from './skill-selection.mts';
import { mkdirSync, symlinkSync } from 'node:fs';

const scratch = scratchDirs('toolbox-selection-');

/** Leaves in a skill's place the relative link the 1.x install wrote. */
function linkAsV1(project: ScratchProject, name: string): void {
  mkdirSync(project.local('.'), { recursive: true });
  symlinkSync(`../../node_modules/@lukiita/toolbox/skills/${name}`, project.local(name), 'dir');
}

describe('needsSelection', () => {
  const nothing = { names: [], all: false };

  it('is true for a project with no skill yet when the command named none', () => {
    expect(needsSelection(nothing, scratchProject(scratch()).folders)).toBe(true);
  });

  it('is false as soon as the command names a skill, or asks for all', () => {
    const { folders } = scratchProject(scratch());
    expect(needsSelection({ names: ['retro'], all: false }, folders)).toBe(false);
    expect(needsSelection({ names: [], all: true }, folders)).toBe(false);
  });

  // A plain install on a project that has skills brings them up to date.
  it('is false for a project that already has skills', () => {
    const project = scratchProject(scratch());
    project.install();
    expect(needsSelection(nothing, project.folders)).toBe(false);
  });

  it('is false for a 1.x project: its links are its selection', () => {
    const project = scratchProject(scratch());
    linkAsV1(project, 'retro');
    expect(needsSelection(nothing, project.folders)).toBe(false);
  });
});

describe('hasInstalledSkills', () => {
  it('is false in a project that never installed, true once it has a record', () => {
    const project = scratchProject(scratch());
    expect(hasInstalledSkills(project.folders)).toBe(false);
    project.install();
    expect(hasInstalledSkills(project.folders)).toBe(true);
  });

  it('is true for a project that only has links the 1.x install wrote', () => {
    const project = scratchProject(scratch());
    linkAsV1(project, 'retro');
    expect(hasInstalledSkills(project.folders)).toBe(true);
  });
});

describe('skillCatalog', () => {
  it('lists what the package ships, each with the first sentence of its description', () => {
    const project = scratchProject(scratch());
    project.ship('retro', {
      'SKILL.md':
        '---\nname: retro\ndescription: Looks back at a feature. Use after it ships.\n---\n',
    });
    expect(skillCatalog(project.folders)).toEqual([
      { name: 'code-review', summary: '' },
      { name: 'retro', summary: 'Looks back at a feature.' },
    ]);
  });
});
