/**
 * The two knobs a project sets, from `quality.sourceWindow` and
 * `quality.featureSlot` in its config. The slot is a regex SOURCE with group 1
 * = the feature name: `src/<feature>/` in package by feature, or nothing at all
 * in the flat package-by-layer layout (`src/domain/`). A monorepo re-anchors
 * it once, for every pattern below (e.g. `^apps/[^/]+/src/(?:([^/]+)/)?`).
 */
export interface PlaceRuleOptions {
    sourceWindow: RegExp;
    featureSlot: string;
}
/** The patterns one slot produces - compiled once per run. */
export interface PlaceRulePatterns {
    /**
     * Where business rules are allowed to live. Exempt wherever they appear in
     * the slot - `src/shared/domain/` is the shared kernel, `src/utils/domain/`
     * is at least a declared home for rules.
     */
    rulePatterns: readonly RegExp[];
    /**
     * The other layers of the package-by-feature layout, exempt only INSIDE a
     * feature - see `isFeatureLayer`. A mapper or gateway in `infra/` has a unit
     * test because it is pure, and it is exactly where it belongs; counted, it
     * is a false positive by punctuation - project-d (2026-09-11) had 8 of 114
     * flagged files like that, in `infra/` or `presentation/` (toolbox issue #2).
     * The folder is an explicit layer declaration; chasing file suffixes
     * (`-gateway.ts`, `.mapper.ts`) instead turns the list into an inventory of
     * every repo's naming habits, always one short.
     *
     * `use-cases/`, `commands/`, `queries/` enter for the same reason as
     * `application/`: in a CQRS layout the handler lives in
     * `commands/aplicar-x/aplicar-x.handler.ts` with no `application/` segment in
     * the path. `infrastructure/` is the long spelling the issue asked for
     * alongside `infra/`. Singulars are accepted because both spellings exist.
     *
     * The price is known and accepted: the metric is about PLACE, not content -
     * a business rule hidden in a feature's `infra/` escapes, the same way it
     * already escapes in `domain/`.
     */
    featureLayerPattern: RegExp;
    domainPattern: RegExp;
}
/**
 * Compiles the patterns for one feature slot.
 *
 * @example
 *   placeRulePatterns('^src/(?:([^/]+)/)?').domainPattern.test('src/billing/domain/x.ts') // true
 */
export declare function placeRulePatterns(featureSlot: string): PlaceRulePatterns;
/**
 * What the report names as the accepted places, next to the count. Folder
 * names only, so it reads the same in every report language. Lives here,
 * not in the gate, so the title cannot drift from the patterns.
 */
export declare const PLACE_RULE_HOMES = "`domain/` / `application/` / `<feature>/{infra,presentation,use-cases,commands,queries}/`";
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
export declare function pureRuleFilesOutsideDomain(paths: readonly string[], options?: PlaceRuleOptions): string[];
