// The skills this repo ships, checked as the installer will copy them.
//
// ADR-0003, invariant 4: a reference from one skill to another must resolve
// from the project's copy. Until 2.0 the skills spelled a path into the
// home directory, which exists only on a machine with the toolbox installed
// globally - a teammate's clone, CI and a cloud session all read a dead path.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { describeSkill, SIBLING_REFERENCE } from './domain/skill-catalog.mts';
import { readShippedSkillTree, readSkillTree, shippedSkills } from './infra/skill-directory.mts';

const REPO = resolve(import.meta.dirname, '..', '..');

interface SkillText {
  skill: string;
  file: string;
  text: string;
}

function shippedTexts(): SkillText[] {
  return shippedSkills(REPO).flatMap((skill) => {
    const tree = readSkillTree(join(REPO, 'skills', skill));
    const entries = tree?.entries() ?? [];
    return entries.map(([file, { content }]) => ({ skill, file, text: content.toString('utf8') }));
  });
}

describe('the shipped skills', () => {
  const texts = shippedTexts();

  it('are found', () => {
    expect(shippedSkills(REPO)).toContain('capability-sync');
    expect(texts.length).toBeGreaterThan(50);
  });

  it('never spell a path into the home directory to reach a skill', () => {
    const offenders = texts
      .filter(({ text }) => text.includes('~/.agents/skills'))
      .map(({ skill, file }) => `${skill}/${file}`);
    expect(offenders).toEqual([]);
  });

  it('point at sibling skills and files that exist', () => {
    const dead = texts.flatMap(({ skill, file, text }) =>
      [...text.matchAll(SIBLING_REFERENCE)]
        .filter(([, sibling, path]) => !existsSync(join(REPO, 'skills', sibling, path)))
        .map(([reference]) => `${skill}/${file}: ${reference}`),
    );
    expect(dead).toEqual([]);
  });

  // A project installs a selection: every sibling a skill reaches must be a
  // skill the package ships, or the install could not bring it along.
  it('need only skills that are shipped', () => {
    const shipped = shippedSkills(REPO);
    const missing = shipped.flatMap((skill) => {
      const tree = readShippedSkillTree(join(REPO, 'skills', skill));
      const needs = tree ? describeSkill(tree).needs : [];
      return needs.filter((sibling) => !shipped.includes(sibling)).map((s) => `${skill} -> ${s}`);
    });
    expect(missing).toEqual([]);
  });
});
