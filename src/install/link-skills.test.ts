import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { linkSkills, shippedSkills } from './link-skills.mts';

const roots: string[] = [];
function scratch(): { packageDir: string; projectRoot: string } {
  const root = mkdtempSync(join(tmpdir(), 'toolbox-link-'));
  roots.push(root);
  const projectRoot = join(root, 'project');
  const packageDir = join(projectRoot, 'node_modules', '@lukiita', 'toolbox');
  for (const skill of ['code-review', 'retro']) {
    mkdirSync(join(packageDir, 'skills', skill), { recursive: true });
    writeFileSync(join(packageDir, 'skills', skill, 'SKILL.md'), '---\nname: x\n---\n');
  }
  mkdirSync(join(packageDir, 'skills', 'not-a-skill'), { recursive: true }); // no SKILL.md
  return { packageDir, projectRoot };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('shippedSkills', () => {
  it('lists only folders with a SKILL.md, sorted', () => {
    const { packageDir } = scratch();
    expect(shippedSkills(packageDir)).toEqual(['code-review', 'retro']);
  });
});

describe('linkSkills', () => {
  it('links every shipped skill into .agents/skills with a relative symlink', () => {
    const { packageDir, projectRoot } = scratch();
    const summary = linkSkills({ packageDir, projectRoot });
    expect(summary.linked).toEqual(['code-review', 'retro']);
    const link = join(projectRoot, '.agents', 'skills', 'code-review');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe('../../node_modules/@lukiita/toolbox/skills/code-review');
  });

  it('is idempotent: the second run changes nothing', () => {
    const { packageDir, projectRoot } = scratch();
    linkSkills({ packageDir, projectRoot });
    expect(linkSkills({ packageDir, projectRoot })).toEqual({
      linked: [],
      unchanged: ['code-review', 'retro'],
      kept: [],
    });
  });

  it("keeps the project's own directory when it has a shipped skill's name", () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, '.agents', 'skills', 'retro'), { recursive: true });
    writeFileSync(join(projectRoot, '.agents', 'skills', 'retro', 'SKILL.md'), 'mine');
    const summary = linkSkills({ packageDir, projectRoot });
    expect(summary.kept).toEqual(['retro']);
    expect(lstatSync(join(projectRoot, '.agents', 'skills', 'retro')).isDirectory()).toBe(true);
  });

  it("keeps the project's own symlink to somewhere else - a pin, not our link", () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, 'my-skills', 'retro'), { recursive: true });
    mkdirSync(join(projectRoot, '.agents', 'skills'), { recursive: true });
    symlinkSync('../../my-skills/retro', join(projectRoot, '.agents', 'skills', 'retro'), 'dir');
    const summary = linkSkills({ packageDir, projectRoot });
    expect(summary.kept).toEqual(['retro']);
    expect(readlinkSync(join(projectRoot, '.agents', 'skills', 'retro'))).toBe(
      '../../my-skills/retro',
    );
  });

  it('replaces a dangling symlink', () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, '.agents', 'skills'), { recursive: true });
    symlinkSync('../../gone/retro', join(projectRoot, '.agents', 'skills', 'retro'), 'dir');
    const summary = linkSkills({ packageDir, projectRoot });
    expect(summary.linked).toContain('retro');
  });

  it('leaves project-local skills with other names untouched', () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, '.agents', 'skills', 'db-change'), { recursive: true });
    linkSkills({ packageDir, projectRoot });
    expect(lstatSync(join(projectRoot, '.agents', 'skills', 'db-change')).isDirectory()).toBe(true);
  });
});
