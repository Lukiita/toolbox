import { describe, expect, it } from 'vitest';

import { blankOutComments } from './blank-out-comments.mjs';

/**
 * Specified behavior (issue #5):
 *
 * Each comment is replaced by spaces and every newline survives, so the result has the same
 * length and the same lines as the input. A comment opener inside a string (`'https://…'`,
 * `"src/*.ts"`) opens nothing - the whole string, escapes included, is code.
 */
describe('blankOutComments', () => {
  describe('replaces a comment with spaces', () => {
    it('a line comment, keeping the code before it and the newline after it', () => {
      expect(blankOutComments('a; // if (x)\nb;')).toBe(`a; ${' '.repeat(9)}\nb;`);
    });

    it('a block comment that spans lines, keeping every newline', () => {
      expect(blankOutComments('/*\n x\n*/ y')).toBe('  \n  \n   y');
    });

    it('a line comment on the last line, with no newline after it', () => {
      expect(blankOutComments('x // y')).toBe(`x ${' '.repeat(4)}`);
    });

    it('a comment inside a template interpolation', () => {
      expect(blankOutComments('const s = `${a /* b */}`;')).toBe(
        `const s = \`\${a ${' '.repeat(7)}}\`;`,
      );
    });

    it('an apostrophe or a `//` inside a block comment opens nothing', () => {
      expect(blankOutComments("/* it's // here */ x;")).toBe(`${' '.repeat(18)} x;`);
    });

    it('a comment inside empty parentheses or an empty block, once', () => {
      expect(blankOutComments('f(/* c */);')).toBe(`f(${' '.repeat(7)});`);
      expect(blankOutComments('const empty = {\n  // nothing yet\n};')).toBe(
        `const empty = {\n${' '.repeat(16)}\n};`,
      );
    });

    it('a JSDoc block whole, even when its text holds a comment opener', () => {
      expect(blankOutComments('/**\n * @see // if (x)\n */\nexport const a = 1;')).toBe(
        `${' '.repeat(3)}\n${' '.repeat(17)}\n${' '.repeat(3)}\nexport const a = 1;`,
      );
    });

    // One token can carry any number of comments: a block of commented-out lines is a single
    // run of leading trivia. Collected with a spread, ~120k of them overflowed the argument
    // list (review round 2, 2026-10-03).
    it('every comment of a very long run, without overflowing', () => {
      expect(blankOutComments(`${'// c\n'.repeat(200_000)}x;`)).toBe(
        `${`${' '.repeat(4)}\n`.repeat(200_000)}x;`,
      );
    });
  });

  // The parser recovers from a syntax error instead of throwing, and a recovered tree is a
  // guess about where strings and comments are. The caller judges such a file with its
  // comments in (review round 2, 2026-10-03).
  describe('refuses a source with a syntax error', () => {
    it('an unterminated block comment', () => {
      expect(() => blankOutComments('x /* if (a')).toThrow(
        "syntax error at offset 10: '*/' expected.",
      );
    });

    it('a stray backtick that flips string and code', () => {
      const source = 'const s = `;\nconst url = `http://h/${p}`; if (a) b();\n';

      expect(() => blankOutComments(source)).toThrow('syntax error at offset 26');
    });

    it('keeps length and line count of the input', () => {
      const source = '/** a\n * b */\nconst c = 1; // d\n';
      const blanked = blankOutComments(source);

      expect(blanked).toHaveLength(source.length);
      expect(blanked.split('\n')).toHaveLength(4);
    });
  });

  describe('leaves code and strings untouched', () => {
    it('a division is not a comment', () => {
      expect(blankOutComments('const r = a / b; // c')).toBe(`const r = a / b; ${' '.repeat(4)}`);
    });

    it('`//` inside a single-quoted string', () => {
      const source = "const url = 'https://example.com';";

      expect(blankOutComments(source)).toBe(source);
    });

    it('`/*` inside a double-quoted string', () => {
      const source = 'const glob = "src/*.ts";';

      expect(blankOutComments(source)).toBe(source);
    });

    it('`//` inside a template literal', () => {
      const source = 'const url = `https://${host}/path`;';

      expect(blankOutComments(source)).toBe(source);
    });

    it('an escaped quote does not end the string early', () => {
      const source = 'const s = "say \\" // still a string";';

      expect(blankOutComments(source)).toBe(source);
    });

    it('a template nested inside `${}` belongs to the outer template', () => {
      const source = 'const glob = `${dirs.map((d) => `${d}/*.ts`)}`;';

      expect(blankOutComments(source)).toBe(source);
    });

    it('a quoted string continued over a line with a backslash is still one string', () => {
      const source = "const s = 'a \\\n// still the string';";

      expect(blankOutComments(source)).toBe(source);
    });

    it('a regex literal holding a quote, a backtick or `//` is code, whole', () => {
      const source = ['const quote = /[\'"`]/;', 'const url = /https?:\\/\\//;'].join('\n');

      expect(blankOutComments(source)).toBe(source);
    });

    it('a shebang line is not a comment', () => {
      expect(blankOutComments('#!/usr/bin/env node\n// c\nx;')).toBe(
        `#!/usr/bin/env node\n${' '.repeat(4)}\nx;`,
      );
    });
  });

  describe('an unclosed quote', () => {
    it('ends at the newline, so the comment on the next line is still blanked', () => {
      expect(blankOutComments("const q = /'/;\n// c")).toBe(`const q = /'/;\n${' '.repeat(4)}`);
    });
  });
});
