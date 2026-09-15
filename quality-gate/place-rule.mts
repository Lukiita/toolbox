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

/**
 * The slot a feature folder occupies: `src/<feature>/` in package by feature,
 * or nothing at all in the flat package-by-layer layout (`src/domain/`) that
 * older repos still use. Group 1 is the feature name, undefined when flat.
 * Adapt on import: a monorepo without `src/` re-anchors here, once, for every
 * pattern below (e.g. `^apps/[^/]+/src/(?:([^/]+)/)?`).
 */
export const FEATURE_SLOT = '^src/(?:([^/]+)/)?';

/**
 * Where business rules are allowed to live. Exempt wherever they appear in
 * the slot - `src/shared/domain/` is the shared kernel, `src/utils/domain/`
 * is at least a declared home for rules.
 */
export const RULE_PATTERNS: readonly RegExp[] = [
  new RegExp(`${FEATURE_SLOT}domain/`),
  new RegExp(`${FEATURE_SLOT}application/`),
];

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
export const FEATURE_LAYER_PATTERN = new RegExp(
  `${FEATURE_SLOT}(?:infra(?:structure)?|presentation|use-cases?|commands?|quer(?:y|ies))/`,
);

const DOMAIN_PATTERN = new RegExp(`${FEATURE_SLOT}domain/`);

/**
 * What the report names as the accepted places, next to the count. Folder
 * names only, so it reads the same in every report language. Lives here,
 * not in `gate.mts`, so the title cannot drift from the patterns.
 */
export const PLACE_RULE_HOMES =
  '`domain/` / `application/` / `<feature>/{infra,presentation,use-cases,commands,queries}/`';

/**
 * The features present: every slot value that has a `domain/` - the folder
 * is the domain, and the layers live inside it (AGENTS.md). The flat layout
 * registers as the empty name. Computed from the same path list, so the
 * metric stays verifiable against any commit.
 */
function featuresWithDomain(paths: readonly string[]): Set<string> {
  const features = new Set<string>();
  for (const p of paths) {
    const match = DOMAIN_PATTERN.exec(p);
    if (match) features.add(match[1] ?? '');
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
function isFeatureLayer(p: string, features: ReadonlySet<string>): boolean {
  const match = FEATURE_LAYER_PATTERN.exec(p);
  return match !== null && features.has(match[1] ?? '');
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
export function pureRuleFilesOutsideDomain(paths: readonly string[]): string[] {
  const all = new Set(paths);
  const features = featuresWithDomain(paths);
  return paths
    .filter(
      (p) =>
        p.startsWith('src/') &&
        !RULE_PATTERNS.some((pattern) => pattern.test(p)) &&
        !isFeatureLayer(p, features) &&
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.endsWith('.d.ts') &&
        all.has(`${p.slice(0, -3)}.test.ts`),
    )
    .sort();
}
