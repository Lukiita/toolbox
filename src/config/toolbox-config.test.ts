import { describe, expect, it } from 'vitest';

import { DEFAULT_QUALITY, defineToolboxConfig, resolveToolboxConfig } from './toolbox-config.mts';

describe('resolveToolboxConfig', () => {
  it('an empty config behaves like a fresh import: every field is the canonical default', () => {
    const resolved = resolveToolboxConfig({});
    expect(resolved.quality.lineLimit).toBe(400);
    expect(resolved.quality.ccLimit).toBe(5);
    expect(resolved.quality.baseBranch).toBe('main');
    expect(resolved.quality.featureSlot).toBe('^src/(?:([^/]+)/)?');
    expect(resolved.hooks.protectedBranches).toEqual(['main', 'develop']);
  });

  it('no argument at all is the same as an empty config', () => {
    expect(resolveToolboxConfig()).toEqual(resolveToolboxConfig({}));
  });

  it('overrides one field and keeps the others', () => {
    const resolved = resolveToolboxConfig({ quality: { lineLimit: 300 } });
    expect(resolved.quality.lineLimit).toBe(300);
    expect(resolved.quality.ccLimit).toBe(5);
  });

  it('a monorepo re-anchors the source window and the feature slot independently', () => {
    const resolved = resolveToolboxConfig({
      quality: {
        sourceWindow: /^apps\/[^/]+\/src\//,
        featureSlot: '^apps/[^/]+/src/(?:([^/]+)/)?',
      },
    });
    expect(resolved.quality.sourceWindow.test('apps/backend/src/x.ts')).toBe(true);
    expect(resolved.quality.sourceWindow.test('src/x.ts')).toBe(false);
  });

  it('does not mutate the defaults when a project overrides a field', () => {
    resolveToolboxConfig({ quality: { aliasPrefixes: { '~/': 'app/' } } });
    expect(DEFAULT_QUALITY.aliasPrefixes).toEqual({ '@/': '' });
  });

  it('defineToolboxConfig returns the object untouched - it exists for the type only', () => {
    const config = { hooks: { protectedBranches: ['main'] } };
    expect(defineToolboxConfig(config)).toBe(config);
  });
});

describe('the hooks watch window follows the feature slot', () => {
  it('a monorepo slot moves the watched patterns with it', () => {
    const { hooks } = resolveToolboxConfig({
      quality: { featureSlot: '^apps/[^/]+/src/(?:([^/]+)/)?' },
    });
    expect(hooks.watchedPatterns.some((p) => p.test('apps/api/src/billing/domain/x.ts'))).toBe(
      true,
    );
    expect(hooks.watchedPatterns.some((p) => p.test('src/billing/domain/x.ts'))).toBe(false);
  });

  it('a project that pins its own watched patterns keeps them', () => {
    const { hooks } = resolveToolboxConfig({ hooks: { watchedPatterns: [/^lib\//] } });
    expect(hooks.watchedPatterns).toEqual([/^lib\//]);
  });

  it('a string where a RegExp belongs (a .mjs config) fails naming the field', () => {
    const bad = { quality: { sourceWindow: '^apps/' } } as unknown as Parameters<
      typeof resolveToolboxConfig
    >[0];
    expect(() => resolveToolboxConfig(bad)).toThrow(
      /quality\.sourceWindow must be a RegExp, received string/,
    );
  });

  it('an array of strings where RegExps belong reports "array", and a string path reports "string"', () => {
    const cast = (v: unknown): Parameters<typeof resolveToolboxConfig>[0] =>
      v as Parameters<typeof resolveToolboxConfig>[0];
    expect(() => resolveToolboxConfig(cast({ hooks: { watchedPatterns: ['^src/'] } }))).toThrow(
      /hooks\.watchedPatterns must be an array of RegExp, received array/,
    );
    expect(() => resolveToolboxConfig(cast({ quality: { duplicationPaths: 'src' } }))).toThrow(
      /quality\.duplicationPaths must be an array of paths, received string/,
    );
    expect(() => resolveToolboxConfig(cast({ quality: { featureSlot: /x/ } }))).toThrow(
      /quality\.featureSlot must be a regex source string, received object/,
    );
    expect(() => resolveToolboxConfig(cast({ hooks: { protectedBranches: 'main' } }))).toThrow(
      /hooks\.protectedBranches must be an array of branch names, received string/,
    );
  });

  it('strips a /g flag from a project regex - .test() must not remember lastIndex', () => {
    const { quality } = resolveToolboxConfig({ quality: { sourceWindow: /^src\//g } });
    expect(quality.sourceWindow.test('src/a.ts')).toBe(true);
    expect(quality.sourceWindow.test('src/b.ts')).toBe(true);
  });

  it('prePushSkipTests defaults to false: the hook runs the suite like CI', () => {
    expect(resolveToolboxConfig().quality.prePushSkipTests).toBe(false);
  });
});
