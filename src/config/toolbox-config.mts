// The project's configuration - the one file a project edits.
//
// Everything the READMEs used to call an "adaptation point" (a constant edited
// inside a copied file) is a field here, read by the library. The code is
// never edited in a project; only this. Defaults equal the canonical values,
// so a project with an empty config behaves like a fresh import (ADR-0001).

import { rulePlacePatterns } from './rule-places.mts';

/** What the quality ratchet measures and where. All optional; see DEFAULT_QUALITY. */
export interface QualityConfig {
  /**
   * Production code, as a regex over repo-relative paths. Drives the size,
   * `any`, complexity, cycle and place-rule collectors and the coverage slice.
   * Default `^src/`; a monorepo widens it (`^apps/[^/]+/src/`).
   */
  sourceWindow: RegExp;
  /**
   * The slot a feature folder occupies, as a regex SOURCE with group 1 = the
   * feature name (undefined in the flat layout). Default `^src/(?:([^/]+)/)?`.
   * A monorepo re-anchors it once, for every layer pattern.
   */
  featureSlot: string;
  /** Above this, a production file enters the size count. Default 400. */
  lineLimit: number;
  /** Above this, a function enters the complexity count. Default 5. */
  ccLimit: number;
  /** Non-relative import prefixes resolved as internal. Default `{ '@/': '' }`. */
  aliasPrefixes: Record<string, string>;
  /** Where the coverage run writes its json, relative to the root. */
  coveragePath: string;
  /** The vitest config the ratchet runs with; `undefined` = the project default. */
  vitestConfig: string | undefined;
  /** Paths jscpd scans, relative to the root. Default `['src']`. */
  duplicationPaths: string[];
  /** The branch pull requests merge into; the pre-push hook measures against its tip. */
  baseBranch: string;
  /**
   * Whether the pre-push hook reuses the coverage json on disk instead of
   * running the suite. Default false - CI runs the suite, and a stale json
   * goes green where CI goes red. Opt in when coverage is not gated or the
   * suite is too slow for a push.
   */
  prePushSkipTests: boolean;
}

/** What the agent hooks watch. All optional; see DEFAULT_HOOKS. */
export interface HooksConfig {
  /** Files that must have a co-located test, as regexes over repo-relative paths. */
  watchedPatterns: RegExp[];
  /** Artefacts with no behaviour of their own that could regress. */
  exemptSuffixes: string[];
  /** Branches a direct `git push` is denied to. */
  protectedBranches: string[];
}

/** The shape of `toolbox.config.ts` in a project: every field optional. */
export interface ToolboxConfig {
  quality?: Partial<QualityConfig>;
  hooks?: Partial<HooksConfig>;
}

/** The config with every field filled - what the library actually reads. */
export interface ResolvedToolboxConfig {
  quality: QualityConfig;
  hooks: HooksConfig;
}

export const DEFAULT_QUALITY: QualityConfig = {
  sourceWindow: /^src\//,
  featureSlot: '^src/(?:([^/]+)/)?',
  lineLimit: 400,
  ccLimit: 5,
  aliasPrefixes: { '@/': '' },
  coveragePath: 'coverage-quality/coverage-final.json',
  vitestConfig: 'vitest.quality.config.ts',
  duplicationPaths: ['src'],
  baseBranch: 'main',
  prePushSkipTests: false,
};

/** The ratchet's rule places for a slot, as the hook's watch list. */
function watchedByDefault(featureSlot: string): RegExp[] {
  const { domain, application } = rulePlacePatterns(featureSlot);
  return [domain, application];
}

export const DEFAULT_HOOKS: HooksConfig = {
  // The same window as the ratchet's rule places, built from the same slot -
  // one source, so a monorepo that re-anchors `quality.featureSlot` moves the
  // hook with it. Edges are excluded on purpose: they hold no business rules
  // by policy, and watching them would fail every pull request that touches
  // a screen.
  watchedPatterns: watchedByDefault(DEFAULT_QUALITY.featureSlot),
  exemptSuffixes: [
    '.test.ts',
    '.d.ts',
    '.types.ts',
    '.type.ts',
    '.config.ts',
    '.constants.ts',
    '.fixtures.ts',
  ],
  protectedBranches: ['main', 'develop'],
};

/**
 * Fills a project's partial config with the defaults, field by field. Pure.
 *
 * @example
 *   resolveToolboxConfig({ quality: { lineLimit: 300 } }).quality.ccLimit // => 5
 */
export function resolveToolboxConfig(partial: ToolboxConfig = {}): ResolvedToolboxConfig {
  validateShapes(partial);
  const quality = { ...DEFAULT_QUALITY, ...partial.quality };
  const hooks = {
    ...DEFAULT_HOOKS,
    // Follows the project's slot unless the project pins its own list.
    watchedPatterns: watchedByDefault(quality.featureSlot),
    ...partial.hooks,
  };
  return {
    quality: { ...quality, sourceWindow: stateless(quality.sourceWindow) },
    hooks: { ...hooks, watchedPatterns: hooks.watchedPatterns.map(stateless) },
  };
}

// A `.mjs` config has no compiler: a string where a RegExp belongs would die
// deep inside a collector as `undefined.replace` with no field name. Each
// message names the field, what it needs and what arrived.
function expectField(name: string, ok: boolean, expected: string, value: unknown): void {
  if (ok) return;
  const received = Array.isArray(value) ? 'array' : typeof value;
  throw new Error(`toolbox.config: ${name} must be ${expected}, received ${received}`);
}

const isRegExp = (v: unknown): boolean => v instanceof RegExp;
const isStrings = (v: unknown): boolean =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const isRegExps = (v: unknown): boolean => Array.isArray(v) && v.every(isRegExp);

function validateQualityShapes(q: Partial<QualityConfig>): void {
  if ('sourceWindow' in q) {
    expectField('quality.sourceWindow', isRegExp(q.sourceWindow), 'a RegExp', q.sourceWindow);
  }
  if ('featureSlot' in q) {
    const ok = typeof q.featureSlot === 'string';
    expectField('quality.featureSlot', ok, 'a regex source string', q.featureSlot);
  }
  if ('duplicationPaths' in q) {
    const ok = isStrings(q.duplicationPaths);
    expectField('quality.duplicationPaths', ok, 'an array of paths', q.duplicationPaths);
  }
}

function validateHooksShapes(h: Partial<HooksConfig>): void {
  if ('watchedPatterns' in h) {
    const ok = isRegExps(h.watchedPatterns);
    expectField('hooks.watchedPatterns', ok, 'an array of RegExp', h.watchedPatterns);
  }
  if ('protectedBranches' in h) {
    const ok = isStrings(h.protectedBranches);
    expectField('hooks.protectedBranches', ok, 'an array of branch names', h.protectedBranches);
  }
}

function validateShapes({ quality = {}, hooks = {} }: ToolboxConfig): void {
  validateQualityShapes(quality);
  validateHooksShapes(hooks);
}

// A `/g` or `/y` flag makes `.test()` remember `lastIndex` between calls, so
// a pattern from a project config would silently skip every other file.
function stateless(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
}

/**
 * Identity with a type: lets `toolbox.config.ts` get autocomplete without
 * importing a type.
 *
 * @example
 *   export default defineToolboxConfig({ quality: { baseBranch: 'develop' } });
 */
export function defineToolboxConfig(config: ToolboxConfig): ToolboxConfig {
  return config;
}
