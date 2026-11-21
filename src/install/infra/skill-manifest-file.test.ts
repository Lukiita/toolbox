import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SkillManifest, SkillManifestError } from '../domain/skill-manifest.mts';
import { scratchDirs } from './scratch-dirs.fixtures.ts';
import { readSkillManifest, writeSkillManifest } from './skill-manifest-file.mts';

const HASH = `sha256:${'a'.repeat(64)}`;
const scratch = scratchDirs('toolbox-manifest-');

const file = (root: string): string => join(root, '.agents', 'toolbox-skills.json');

describe('the skills manifest on disk', () => {
  it('reads as empty when the project has none', () => {
    expect(readSkillManifest(scratch()).names()).toEqual([]);
  });

  it('is written at .agents/toolbox-skills.json and read back', () => {
    const root = scratch();
    const manifest = SkillManifest.empty();
    manifest.record('retro', { version: '1.2.0', hash: HASH });
    writeSkillManifest(root, manifest);
    expect(readFileSync(file(root), 'utf8')).toBe(manifest.serialize());
    expect(readSkillManifest(root).find('retro')).toEqual({ version: '1.2.0', hash: HASH });
  });

  it('is not rewritten when nothing changed', () => {
    const root = scratch();
    const manifest = SkillManifest.empty();
    manifest.record('retro', { version: '1.2.0', hash: HASH });
    writeSkillManifest(root, manifest);
    const long_ago = new Date('2020-01-01T00:00:00Z');
    utimesSync(file(root), long_ago, long_ago);
    writeSkillManifest(root, manifest);
    expect(statSync(file(root)).mtime).toEqual(long_ago);
  });

  it('is not created for a project with nothing recorded', () => {
    const root = scratch();
    writeSkillManifest(root, SkillManifest.empty());
    expect(existsSync(file(root))).toBe(false);
  });

  it('fails naming the file when its content is broken', () => {
    const root = scratch();
    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(file(root), '{ nope');
    expect(() => readSkillManifest(root)).toThrow(SkillManifestError);
    expect(() => readSkillManifest(root)).toThrow(
      /^\.agents\/toolbox-skills\.json: skills manifest is not valid JSON: /,
    );
  });

  // Followed, a link here made an install create or overwrite the file it
  // pointed at, outside the project.
  const REFUSED_LINK =
    '.agents/toolbox-skills.json: expected a regular file, found a symbolic link; the manifest is never read or written through one';

  function withAManifestLink(target: string | undefined): { root: string; pointsAt: string } {
    const root = scratch();
    const pointsAt = join(root, 'target.json');
    if (target !== undefined) writeFileSync(pointsAt, target);
    mkdirSync(join(root, '.agents'), { recursive: true });
    symlinkSync(pointsAt, file(root));
    return { root, pointsAt };
  }

  function aManifest(): SkillManifest {
    const manifest = SkillManifest.empty();
    manifest.record('retro', { version: '1.2.0', hash: HASH });
    return manifest;
  }

  it('refuses a link to a file, on reading and on writing, and leaves the file as it was', () => {
    const { root, pointsAt } = withAManifestLink('precious');
    expect(() => readSkillManifest(root)).toThrow(new SkillManifestError(REFUSED_LINK));
    expect(() => writeSkillManifest(root, aManifest())).toThrow(
      new SkillManifestError(REFUSED_LINK),
    );
    expect(readFileSync(pointsAt, 'utf8')).toBe('precious');
  });

  it('refuses a link to nothing, and creates nothing where it points', () => {
    const { root, pointsAt } = withAManifestLink(undefined);
    expect(() => readSkillManifest(root)).toThrow(new SkillManifestError(REFUSED_LINK));
    expect(() => writeSkillManifest(root, aManifest())).toThrow(
      new SkillManifestError(REFUSED_LINK),
    );
    expect(existsSync(pointsAt)).toBe(false);
  });

  it('refuses a folder where the manifest goes', () => {
    const root = scratch();
    mkdirSync(file(root), { recursive: true });
    expect(() => readSkillManifest(root)).toThrow(
      new SkillManifestError(
        '.agents/toolbox-skills.json: expected a regular file, found a folder; the manifest is never read or written through one',
      ),
    );
  });

  it('refuses a file far too large to be a manifest, instead of reading it whole', () => {
    const root = scratch();
    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(file(root), 'x'.repeat(1024 * 1024 + 1));
    expect(() => readSkillManifest(root)).toThrow(
      new SkillManifestError(
        '.agents/toolbox-skills.json: received a file of 1048577 bytes, expected a manifest of at most 1048576',
      ),
    );
  });
});
