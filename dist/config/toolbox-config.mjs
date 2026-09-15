// The project's configuration - the one file a project edits.
//
// Everything the READMEs used to call an "adaptation point" (a constant edited
// inside a copied file) is a field here, read by the library. The code is
// never edited in a project; only this. Defaults equal the canonical values,
// so a project with an empty config behaves like a fresh import (ADR-0001).
import { rulePlacePatterns } from "./rule-places.mjs";
export const DEFAULT_QUALITY = {
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
function watchedByDefault(featureSlot) {
    const { domain, application } = rulePlacePatterns(featureSlot);
    return [domain, application];
}
export const DEFAULT_HOOKS = {
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
export function resolveToolboxConfig(partial = {}) {
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
function expectField(name, ok, expected, value) {
    if (ok)
        return;
    const received = Array.isArray(value) ? 'array' : typeof value;
    throw new Error(`toolbox.config: ${name} must be ${expected}, received ${received}`);
}
const isRegExp = (v) => v instanceof RegExp;
const isStrings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isRegExps = (v) => Array.isArray(v) && v.every(isRegExp);
function validateQualityShapes(q) {
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
function validateHooksShapes(h) {
    if ('watchedPatterns' in h) {
        const ok = isRegExps(h.watchedPatterns);
        expectField('hooks.watchedPatterns', ok, 'an array of RegExp', h.watchedPatterns);
    }
    if ('protectedBranches' in h) {
        const ok = isStrings(h.protectedBranches);
        expectField('hooks.protectedBranches', ok, 'an array of branch names', h.protectedBranches);
    }
}
function validateShapes({ quality = {}, hooks = {} }) {
    validateQualityShapes(quality);
    validateHooksShapes(hooks);
}
// A `/g` or `/y` flag makes `.test()` remember `lastIndex` between calls, so
// a pattern from a project config would silently skip every other file.
function stateless(pattern) {
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
}
/**
 * Identity with a type: lets `toolbox.config.ts` get autocomplete without
 * importing a type.
 *
 * @example
 *   export default defineToolboxConfig({ quality: { baseBranch: 'develop' } });
 */
export function defineToolboxConfig(config) {
    return config;
}
