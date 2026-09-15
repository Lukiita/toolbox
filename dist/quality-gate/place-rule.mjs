// The place rule. AGENTS.md says where business rules live: `domain/` (and
// the use case that orchestrates them, in `application/`), as pure code with
// a unit test beside it. This collector finds the opposite case: a `.ts`
// under `src/` **with a test beside it** that sits in no layer of any
// feature - the signature of a pure rule living at the edge, because nobody
// writes a unit test for UI wiring or for a Supabase repository.
//
// Why the metric exists: in the source project, a model review that cost
// US$ 2.72 answered "no CLAUDE.md violations" for a file that was exactly
// this. A grep does not get that question wrong and does not get tired.
//
// It also covers a hole lint cannot see: an import-direction rule only fires
// when the rule reached `domain/` in the first place. A rule born straight
// inside a component has no boundary import to violate - this collector is
// what catches it.
import { rulePlacePatterns } from "../config/rule-places.mjs";
import { DEFAULT_QUALITY } from "../config/toolbox-config.mjs";
/**
 * Compiles the patterns for one feature slot.
 *
 * @example
 *   placeRulePatterns('^src/(?:([^/]+)/)?').domainPattern.test('src/billing/domain/x.ts') // true
 */
export function placeRulePatterns(featureSlot) {
    const { domain, application } = rulePlacePatterns(featureSlot);
    return {
        rulePatterns: [domain, application],
        featureLayerPattern: new RegExp(`${featureSlot}(?:infra(?:structure)?|presentation|use-cases?|commands?|quer(?:y|ies))/`),
        domainPattern: domain,
    };
}
/**
 * What the report names as the accepted places, next to the count. Folder
 * names only, so it reads the same in every report language. Lives here,
 * not in the gate, so the title cannot drift from the patterns.
 */
export const PLACE_RULE_HOMES = '`domain/` / `application/` / `<feature>/{infra,presentation,use-cases,commands,queries}/`';
/**
 * The features present: every slot value that has a `domain/` - the folder
 * is the domain, and the layers live inside it (AGENTS.md). The flat layout
 * registers as the empty name. Computed from the same path list, so the
 * metric stays verifiable against any commit.
 */
function featuresWithDomain(paths, domainPattern) {
    const features = new Set();
    for (const p of paths) {
        const match = domainPattern.exec(p);
        if (match)
            features.add(match[1] ?? '');
    }
    return features;
}
/**
 * A layer folder counts as a layer only inside a feature. Without this,
 * `src/utils/queries/` or `src/hooks/queries/` would be exempt too, and
 * renaming `utils/functions/` to `utils/queries/` would silence the metric
 * (found in the review of issue #2). A technical lib with no layers
 * (`src/core/firebase/`) stays counted on purpose: exempting "libs" would
 * open the hole through which the real hits in `regras/` and
 * `utils/functions/` escape.
 */
function isFeatureLayer(p, pattern, features) {
    const match = pattern.exec(p);
    return match !== null && features.has(match[1] ?? '');
}
// `.ts`, `.mts`, `.cts` - not `.tsx` (a component is a render shell by
// policy), not tests, not declarations. `.mts`/`.cts` were invisible here
// while size, complexity and coverage already counted them (loop round 2).
const MODULE_EXT = /\.(ts|mts|cts)$/;
function isPlainModule(p) {
    return MODULE_EXT.test(p) && !/\.(test|d)\.(ts|mts|cts)$/.test(p);
}
// The test beside `x.mts` is `x.test.ts` in every repo of ours; `x.test.mts` counts too.
function hasTestBeside(p, all) {
    const base = p.replace(MODULE_EXT, '');
    const ext = p.slice(base.length);
    return all.has(`${base}.test.ts`) || all.has(`${base}.test${ext}`);
}
/**
 * Takes paths relative to the repo root (what `git ls-files` returns) and
 * returns, sorted, the ones that look like pure rules outside the rule
 * directories.
 *
 * Pure on purpose: the file list may come from the worktree or from any
 * commit (`git ls-tree -r <rev> --name-only`), which makes the metric
 * verifiable against the past without a checkout.
 *
 * @example
 *   pureRuleFilesOutsideDomain(['src/utils/money.ts', 'src/utils/money.test.ts'])
 *   // => ['src/utils/money.ts']
 */
export function pureRuleFilesOutsideDomain(paths, options = DEFAULT_QUALITY) {
    const all = new Set(paths);
    const { rulePatterns, featureLayerPattern, domainPattern } = placeRulePatterns(options.featureSlot);
    const features = featuresWithDomain(paths, domainPattern);
    return paths
        .filter((p) => options.sourceWindow.test(p) &&
        !rulePatterns.some((pattern) => pattern.test(p)) &&
        !isFeatureLayer(p, featureLayerPattern, features) &&
        isPlainModule(p) &&
        hasTestBeside(p, all))
        .sort();
}
