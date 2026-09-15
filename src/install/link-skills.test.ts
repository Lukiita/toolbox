import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

  it("keeps the project's link into a sibling package whose name only shares our prefix", () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, 'node_modules', '@lukiita', 'toolbox-extra', 'skills', 'retro'), {
      recursive: true,
    });
    mkdirSync(join(projectRoot, '.agents', 'skills'), { recursive: true });
    symlinkSync(
      '../../node_modules/@lukiita/toolbox-extra/skills/retro',
      join(projectRoot, '.agents', 'skills', 'retro'),
      'dir',
    );
    expect(linkSkills({ packageDir, projectRoot }).kept).toEqual(['retro']);
  });

  it('replaces a dangling symlink', () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, '.agents', 'skills'), { recursive: true });
    symlinkSync('../../gone/retro', join(projectRoot, '.agents', 'skills', 'retro'), 'dir');
    const summary = linkSkills({ packageDir, projectRoot });
    expect(summary.linked).toContain('retro');
  });

  it('links correctly when .agents/skills is itself a symlink to elsewhere', () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, '..', 'elsewhere', 'skills'), { recursive: true });
    mkdirSync(join(projectRoot, '.agents'), { recursive: true });
    symlinkSync('../../elsewhere/skills', join(projectRoot, '.agents', 'skills'), 'dir');
    linkSkills({ packageDir, projectRoot });
    const viaLink = join(projectRoot, '.agents', 'skills', 'code-review', 'SKILL.md');
    expect(readFileSync(viaLink, 'utf8')).toContain('name: x');
  });

  it('under a pnpm-style symlinked package dir, links the nominal path and updates when the hash changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolbox-pnpm-'));
    roots.push(root);
    const projectRoot = join(root, 'project');
    const storeOf = (hash: string): string =>
      join(
        projectRoot,
        'node_modules',
        '.pnpm',
        `toolbox@${hash}`,
        'node_modules',
        '@lukiita',
        'toolbox',
      );
    for (const hash of ['h1', 'h2']) {
      mkdirSync(join(storeOf(hash), 'skills', 'retro'), { recursive: true });
      writeFileSync(join(storeOf(hash), 'skills', 'retro', 'SKILL.md'), `hash ${hash}`);
    }
    const packageDir = join(projectRoot, 'node_modules', '@lukiita', 'toolbox');
    mkdirSync(join(projectRoot, 'node_modules', '@lukiita'), { recursive: true });
    symlinkSync(storeOf('h1'), packageDir, 'dir');
    linkSkills({ packageDir, projectRoot });
    const link = join(projectRoot, '.agents', 'skills', 'retro');
    expect(readlinkSync(link)).toBe('../../node_modules/@lukiita/toolbox/skills/retro');
    expect(linkSkills({ packageDir, projectRoot }).unchanged).toEqual(['retro']);
    // pnpm update: the package dir now points at h2, h1 still on disk
    rmSync(packageDir);
    symlinkSync(storeOf('h2'), packageDir, 'dir');
    expect(linkSkills({ packageDir, projectRoot }).unchanged).toEqual(['retro']);
    expect(readFileSync(join(link, 'SKILL.md'), 'utf8')).toBe('hash h2');
  });

  it('leaves project-local skills with other names untouched', () => {
    const { packageDir, projectRoot } = scratch();
    mkdirSync(join(projectRoot, '.agents', 'skills', 'db-change'), { recursive: true });
    linkSkills({ packageDir, projectRoot });
    expect(lstatSync(join(projectRoot, '.agents', 'skills', 'db-change')).isDirectory()).toBe(true);
  });
});
