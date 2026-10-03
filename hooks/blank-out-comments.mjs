/**
 * Comment remover for `check-missing-tests.mjs`: keeps a branch marker written in prose
 * (`if (`, `||`, a `?` in a JSDoc sentence) from being read as a branch of the code.
 *
 * Why it exists (issue #5, first seen in project-d, 2026-09-23): the heuristic used to test
 * the whole file, comments included, so a logic-free `abstract class` port whose JSDoc says
 * "returns null if it does not exist || was deleted?" was required to have a test. The only
 * exits left to the author were a test with nothing to assert or a comment reworded to dodge
 * the regex - both worse than the bug.
 *
 * Why the TypeScript parser, and not a comment regex or a hand-written scanner: where a
 * comment starts depends on what surrounds it. `//` inside `'https://…'`, inside a template or
 * inside a regex literal (`/https?:\/\//`) opens nothing, and telling a regex from a division
 * needs the token before it. The first cut was a character scanner ported from project-d;
 * review (2026-10-03) showed it HIDING code - a backtick in a regex literal
 * (`s.replace(/`/g, '')`) opened a template that swallowed the lines after it, a nested
 * template turned a glob into a block comment, a line comment ran past U+2028 - and each fix
 * grew a lexer. Hiding a branch is the one wrong answer a gate may not give: the file is
 * excused from its test. The compiler already ships with this package (`dependencies`) and
 * the ratchet's collectors read source through it (complexity.mts, cycles.mts, any-count.mts),
 * so the hook asks the same parser instead of keeping a second, weaker one.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @type {typeof import('typescript') | undefined} */
let compiler;

/**
 * The compiler, loaded on first use: it costs ~200 ms to load (measured 2026-10-03) and the
 * Stop hook runs on every agent stop, almost always with no file to judge.
 */
function typescript() {
  compiler ??= require('typescript');
  return compiler;
}

/**
 * Replaces every comment with spaces and keeps every newline, so the result has the same
 * length and the same lines as `source` (offsets and line numbers still point to the same code).
 *
 * @param {string} source TypeScript source text.
 * @returns {string} The same text with each comment blanked out.
 * @example
 * blankOutComments('a; // if (x)\nb;') // 'a;          \nb;'
 */
export function blankOutComments(source) {
  const pieces = [];
  let cursor = 0;
  for (const { pos, end } of commentRanges(source)) {
    // A repeat: an empty list between two tokens (`f()`, `{}`) is a leaf too, and reports the
    // comment the token before it already reported. Blanking it twice would lengthen the text.
    if (pos < cursor) continue;
    pieces.push(source.slice(cursor, pos), source.slice(pos, end).replace(/[^\n]/g, ' '));
    cursor = end;
  }
  pieces.push(source.slice(cursor));
  return pieces.join('');
}

/**
 * Every comment of the source, in order. A comment is not a node of the tree: it rides as
 * trivia before a token (leading) or after it on the same line (trailing), so every token is
 * asked for both. JSDoc nodes are skipped - they ARE the comment, already found as the leading
 * trivia of the token they document. Walking into one asks for trivia from inside comment
 * text: a `//` written in a `@see` line was reported first, and the block around it was then
 * dropped as a repeat, left unblanked.
 */
function commentRanges(source) {
  const ts = typescript();
  const sourceFile = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, false);
  const ranges = [];
  const visit = (node) => {
    const children = node.getChildren(sourceFile).filter((child) => !ts.isJSDoc(child));
    if (children.length > 0) return children.forEach(visit);
    ranges.push(...(ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []));
    ranges.push(...(ts.getTrailingCommentRanges(source, node.getEnd()) ?? []));
  };
  visit(sourceFile);
  return ranges;
}
