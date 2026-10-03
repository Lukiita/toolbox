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

    it('an unterminated block comment runs to the end of the file', () => {
      expect(blankOutComments('x /* if (a')).toBe(`x ${' '.repeat(8)}`);
    });

    it('a line comment on the last line, with no newline after it', () => {
      expect(blankOutComments('x // y')).toBe(`x ${' '.repeat(4)}`);
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
  });

  describe('an unclosed quote', () => {
    it('ends at the newline, so the comment on the next line is still blanked', () => {
      expect(blankOutComments("const q = /'/;\n// c")).toBe(`const q = /'/;\n${' '.repeat(4)}`);
    });
  });
});
