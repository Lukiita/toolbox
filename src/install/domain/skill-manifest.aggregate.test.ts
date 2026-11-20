import { describe, expect, it } from 'vitest';

import { SkillManifest, SkillManifestError } from './skill-manifest.aggregate.mts';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

describe('SkillManifest', () => {
  it('starts empty', () => {
    const manifest = SkillManifest.empty();
    expect(manifest.names()).toEqual([]);
    expect(manifest.find('code-review')).toBeUndefined();
  });

  it('records where a skill came from: the toolbox version and the hash of the original', () => {
    const manifest = SkillManifest.empty();
    manifest.record('code-review', { version: '1.2.0', hash: HASH_A });
    expect(manifest.find('code-review')).toEqual({ version: '1.2.0', hash: HASH_A });
  });

  it('replaces the record of a skill recorded again', () => {
    const manifest = SkillManifest.empty();
    manifest.record('code-review', { version: '1.2.0', hash: HASH_A });
    manifest.record('code-review', { version: '1.3.0', hash: HASH_B });
    expect(manifest.find('code-review')).toEqual({ version: '1.3.0', hash: HASH_B });
    expect(manifest.names()).toEqual(['code-review']);
  });

  it('lists the names sorted', () => {
    const manifest = SkillManifest.empty();
    manifest.record('retro', { version: '1.2.0', hash: HASH_A });
    manifest.record('code-review', { version: '1.2.0', hash: HASH_A });
    expect(manifest.names()).toEqual(['code-review', 'retro']);
  });

  it('refuses a hash that is not a sha256 of a tree', () => {
    expect(() => SkillManifest.empty().record('retro', { version: '1.2.0', hash: 'abc' })).toThrow(
      new SkillManifestError(
        'skill "retro": hash received "abc", expected "sha256:" followed by 64 hex digits',
      ),
    );
  });

  it('refuses a version that is not a release number', () => {
    expect(() =>
      SkillManifest.empty().record('retro', { version: 'latest', hash: HASH_A }),
    ).toThrow(
      new SkillManifestError(
        'skill "retro": version received "latest", expected "<major>.<minor>.<patch>"',
      ),
    );
  });

  // A name becomes a folder under .agents/skills/ and under the base.
  it.each(['../x', 'a/b', '', '.'])('refuses the name %j, which is not a folder name', (name) => {
    expect(() => SkillManifest.empty().record(name, { version: '1.2.0', hash: HASH_A })).toThrow(
      new SkillManifestError(
        `skill name: received ${JSON.stringify(name)}, expected a folder name (letters, digits, ".", "_", "-")`,
      ),
    );
  });
});

describe('SkillManifest serialisation', () => {
  it('writes sorted, indented json with a note for whoever opens the file', () => {
    const manifest = SkillManifest.empty();
    manifest.record('retro', { version: '1.2.0', hash: HASH_B });
    manifest.record('code-review', { version: '1.3.0', hash: HASH_A });
    const written = manifest.serialize();
    expect(written.endsWith('}\n')).toBe(true);
    const json = JSON.parse(written) as Record<string, unknown>;
    expect(Object.keys(json)).toEqual(['_readme', 'schemaVersion', 'skills']);
    expect(json.schemaVersion).toBe(1);
    expect(json.skills).toEqual({
      'code-review': { version: '1.3.0', hash: HASH_A },
      retro: { version: '1.2.0', hash: HASH_B },
    });
    expect(Object.keys(json.skills as object)).toEqual(['code-review', 'retro']);
    expect(written).toContain('\n  "schemaVersion": 1,\n');
  });

  it('reads back what it wrote', () => {
    const manifest = SkillManifest.empty();
    manifest.record('retro', { version: '1.2.0', hash: HASH_B });
    const again = SkillManifest.parse(manifest.serialize());
    expect(again.find('retro')).toEqual({ version: '1.2.0', hash: HASH_B });
    expect(again.serialize()).toBe(manifest.serialize());
  });

  it('refuses a file that is not json', () => {
    expect(() => SkillManifest.parse('{ nope')).toThrow(SkillManifestError);
    expect(() => SkillManifest.parse('{ nope')).toThrow(/^skills manifest is not valid JSON: /);
  });

  it('refuses a manifest written by a newer toolbox instead of misreading it', () => {
    expect(() => SkillManifest.parse('{"schemaVersion":2,"skills":{}}')).toThrow(
      new SkillManifestError(
        'skills manifest: schemaVersion received 2, expected 1 - it was written by a newer toolbox; update the package',
      ),
    );
  });

  it.each(['[]', 'null', '{"schemaVersion":1}', '{"schemaVersion":1,"skills":[]}'])(
    'refuses %s, which has no "skills" object',
    (json) => {
      expect(() => SkillManifest.parse(json)).toThrow(SkillManifestError);
    },
  );

  it('refuses a record with a broken shape, naming the skill', () => {
    const json = '{"schemaVersion":1,"skills":{"retro":{"version":"1.2.0"}}}';
    expect(() => SkillManifest.parse(json)).toThrow(
      new SkillManifestError(
        'skill "retro": hash received undefined, expected "sha256:" followed by 64 hex digits',
      ),
    );
  });

  it('refuses a record that is not an object', () => {
    expect(() => SkillManifest.parse('{"schemaVersion":1,"skills":{"retro":null}}')).toThrow(
      new SkillManifestError(
        'skill "retro": version received undefined, expected "<major>.<minor>.<patch>"',
      ),
    );
  });
});
