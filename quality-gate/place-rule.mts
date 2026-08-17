// The place rule. AGENTS.md says where business rules live: `domain/` (and
// the use case that orchestrates them, in `application/`), as pure code with
// a unit test beside it. This collector finds the opposite case: a `.ts`
// anywhere else under `src/` **with a test beside it** - the signature of a
// pure rule living at the edge, because nobody writes a unit test for UI
// wiring or for a Supabase repository.
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
 * Where business rules are allowed to live. Patterns, not prefixes, because
 * the canonical layout is package by feature - the folder is the domain and
 * the layers live inside it (`src/processo-aduaneiro/domain/`). The optional
 * segment also accepts the flat package-by-layer layout (`src/domain/`) that
 * older repos still use, and a `src/shared/domain/` kernel. Adapt on import.
 */
export const RULE_PATTERNS: readonly RegExp[] = [
  /^src\/(?:[^/]+\/)?domain\//,
  /^src\/(?:[^/]+\/)?application\//,
];

/**
 * Takes paths relative to the repo root (what `git ls-files` returns) and
 * returns, sorted, the ones that look like pure rules outside the rule
 * directories.
 *
 * Pure on purpose: the file list may come from the worktree or from any
 * commit (`git ls-tree -r <rev> --name-only`), which makes the metric
 * verifiable against the past without a checkout.
 */
export function pureRuleFilesOutsideDomain(paths: readonly string[]): string[] {
  const all = new Set(paths);
  return paths
    .filter(
      (p) =>
        p.startsWith('src/') &&
        !RULE_PATTERNS.some((pattern) => pattern.test(p)) &&
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.endsWith('.d.ts') &&
        all.has(`${p.slice(0, -3)}.test.ts`),
    )
    .sort();
}
