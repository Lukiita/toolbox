// The place rule. AGENTS.md says where business rules live: `src/domain/`
// (and the use case that orchestrates them, in `src/application/`), as pure
// code with a unit test beside it. This collector finds the opposite case: a
// `.ts` anywhere else under `src/` **with a test beside it** - the signature
// of a pure rule living at the edge, because nobody writes a unit test for UI
// wiring or for a Supabase repository.
//
// Why the metric exists: in the source project, a model review that cost
// US$ 2.72 answered "no CLAUDE.md violations" for a file that was exactly
// this. A grep does not get that question wrong and does not get tired.
//
// It also covers a hole lint cannot see: an import-direction rule (ADR-003,
// `domain/` imports nothing) only fires when the rule reached `domain/` in
// the first place. A rule born straight inside a component has no boundary
// import to violate - this collector is what catches it.

/** Where business rules are allowed to live (adapt on import - ADR-003 here). */
export const RULE_DIRECTORIES = ['src/domain/', 'src/application/'];

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
        !RULE_DIRECTORIES.some((dir) => p.startsWith(dir)) &&
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.endsWith('.d.ts') &&
        all.has(`${p.slice(0, -3)}.test.ts`),
    )
    .sort();
}
