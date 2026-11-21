import { existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
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
});
