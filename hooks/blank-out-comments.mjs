/**
 * Comment scanner for `check-missing-tests.mjs`: keeps a branch marker written in prose
 * (`if (`, `||`, a `?` in a JSDoc sentence) from being read as a branch of the code.
 *
 * Why it exists (issue #5, ported from project-d, 2026-09-23): the heuristic used to test
 * the whole file, comments included, so a logic-free `abstract class` port whose JSDoc says
 * "returns null if it does not exist || was deleted?" was required to have a test. The only
 * exits left to the author were a test with nothing to assert or a comment reworded to dodge
 * the regex - both worse than the bug.
 *
 * Why a scanner and not a comment regex: `//` and `/*` inside a string open no comment, and
 * a regex would erase the rest of the line after `'https://…'`, hiding a real `if`. The
 * scanner walks the source one chunk at a time - line comment, block comment, a whole string
 * or a single character of code - so it always knows whether it is inside a string.
 *
 * Known limitation, deliberately not solved: a regex literal that holds a quote or a comment
 * opener (`/['"]/`, `/https?:\/\//`) can confuse the scanner, which reads the quote as the
 * start of a string. It did not show up in practice in the repos that use this heuristic;
 * telling a regex from a division needs the previous token, which is a parser's job, and a
 * parser here would cost more than the case it fixes.
 */

const QUOTES = `'"\``;

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
  let blanked = '';
  let position = 0;
  while (position < source.length) {
    const { end, isComment } = readChunk(source, position);
    const chunk = source.slice(position, end);
    blanked += isComment ? chunk.replace(/[^\n]/g, ' ') : chunk;
    position = end;
  }
  return blanked;
}

/** One chunk starting at `start`: a comment, a whole string, or one character of code. */
function readChunk(source, start) {
  const opener = source.slice(start, start + 2);
  if (opener === '//') return { end: endOfLineComment(source, start), isComment: true };
  if (opener === '/*') return { end: endOfBlockComment(source, start), isComment: true };
  if (QUOTES.includes(source[start])) return { end: endOfString(source, start), isComment: false };
  return { end: start + 1, isComment: false };
}

/** The newline stays outside the comment, so it survives the blanking. */
function endOfLineComment(source, start) {
  const newline = source.indexOf('\n', start);
  return newline === -1 ? source.length : newline;
}

/** A block comment with no closer (truncated file) runs to the end, like a line one. */
function endOfBlockComment(source, start) {
  const closer = source.indexOf('*/', start + 2);
  return closer === -1 ? source.length : closer + 2;
}

/** Walks past escapes (`\"`, `\\`) so an escaped quote does not end the string early. */
function endOfString(source, start) {
  const quote = source[start];
  let position = start + 1;
  while (position < source.length && source[position] !== quote) {
    position += source[position] === '\\' ? 2 : 1;
  }
  return Math.min(position + 1, source.length);
}
