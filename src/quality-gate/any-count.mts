// Explicit `any` counter (AST-based).
//
// AGENTS.md says types are the agent's ground truth - no `any`, no untyped
// signatures. A repo with legacy debt cannot just flip
// `@typescript-eslint/no-explicit-any` to 'error' everywhere: the build breaks
// on day one (measured in the source project: no-explicit-any is 'off' in the
// broad scope and ~174 production `any`s live outside the strict zones). The
// ratchet is the middle ground - freeze today's count, let it only shrink.
//
// AST, not regex: the word `any` also lives in comments and strings; only the
// type keyword counts. Same production window as size.mts (tests excluded):
// an `any` inside a test is lesser debt, and the contract being protected is
// the production type surface.

import ts from 'typescript';

import { isSizedFile } from './size.mts';

export interface FileAnyCount {
  file: string;
  count: number;
}

/** `any` keyword nodes in one source. Pure - feed it any content. */
export function explicitAnyCount(relPath: string, source: string): number {
  const kind = relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, kind);
  let count = 0;
  const walk = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) count += 1;
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return count;
}

/** Which files enter the count - the exact window `size.mts` measures. */
export const isAnyCheckedFile = isSizedFile;

/** Files that still carry `any`, worst first, ties by path. */
export function filesWithAny(measured: readonly FileAnyCount[]): FileAnyCount[] {
  return measured
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}
