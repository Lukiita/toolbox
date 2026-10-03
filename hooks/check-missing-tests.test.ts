import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { codeHasBranching } from './check-missing-tests.mjs';

/**
 * Specified behavior (issue #5):
 *
 * The branching that requires a test is the CODE's. A `?`, `||` or `if (` written inside a
 * comment creates no alternate path to regress, so a logic-free `abstract class` port whose
 * JSDoc describes its contract in prose must not trigger the hook. Removing comments must not
 * swallow code: `//` or `/*` inside a string does not open a comment.
 */
describe('codeHasBranching', () => {
  describe('ignores what is written in a comment', () => {
    it('an `if` in a line comment', () => {
      const source = ['// if (x) something happens', 'export const value = 1;'].join('\n');

      expect(codeHasBranching(source)).toBe(false);
    });

    it('`||` and `?` in the JSDoc block of an abstract-class port', () => {
      const source = [
        '/**',
        ' * Finds the owner - returns null if it does not exist || was deleted?',
        ' */',
        'export abstract class OwnerGateway {',
        '  public abstract find(id: string): Promise<Owner | null>;',
        '}',
      ].join('\n');

      expect(codeHasBranching(source)).toBe(false);
    });

    it('`&&` and `throw` in a block comment that opens and closes on one line', () => {
      const source = 'export const limit = 10; /* a && b, else throw */';

      expect(codeHasBranching(source)).toBe(false);
    });
  });

  describe('still sees the branching of the code', () => {
    it('a real `if`', () => {
      expect(codeHasBranching('if (x) return;')).toBe(true);
    });

    it('a real `??` next to a comment', () => {
      const source = 'const name = input ?? fallback; // default value';

      expect(codeHasBranching(source)).toBe(true);
    });

    it('a real `if` right after a block comment on the same line', () => {
      expect(codeHasBranching('/* guard */ if (x) return;')).toBe(true);
    });

    it('`//` inside a string does not hide the `if` that follows it', () => {
      const source = "const url = 'https://example.com'; if (x) return;";

      expect(codeHasBranching(source)).toBe(true);
    });

    it('`/*` inside a string does not open a block comment', () => {
      const source = 'const glob = "src/*.ts"; if (x) return; const end = "*/";';

      expect(codeHasBranching(source)).toBe(true);
    });

    it('`/*` in a template nested inside `${}` does not open a block comment', () => {
      const source = 'const glob = `${dirs.map((d) => `${d}/*.ts`)}`;\nif (x) return;';

      expect(codeHasBranching(source)).toBe(true);
    });

    it('`//` in a template nested inside `${}` does not hide the `||` after it', () => {
      const source = 'const url = `${join(`http://a`)}`; const v = a || b;';

      expect(codeHasBranching(source)).toBe(true);
    });

    it('a brace inside `${}` does not end the interpolation early', () => {
      const source = 'const s = `${fmt({ a: 1 }, `x/*y`)}`;\nif (z) return;';

      expect(codeHasBranching(source)).toBe(true);
    });

    it('a quote in a regex literal cannot swallow the line after it', () => {
      const source = ['const quote = /[\'"]/;', "const url = 'http://a'; if (x) return;"].join(
        '\n',
      );

      expect(codeHasBranching(source)).toBe(true);
    });

    it('a backtick in a regex literal does not open a template that swallows the file', () => {
      const source = [
        "export const stripTicks = (s: string): string => s.replace(/`/g, '');",
        'export const glob = (dir: string): string => `${dir}/*.ts`;',
        "export function pick(x?: string): string { if (x) return x; return ''; }",
        '/** end */',
      ].join('\n');

      expect(codeHasBranching(source)).toBe(true);
    });

    it('`//` in a regex literal does not hide the `||` after it', () => {
      const source = 'const isUrl = /https?:\\/\\//.test(s) || other;';

      expect(codeHasBranching(source)).toBe(true);
    });

    it('a line comment ends at every line terminator JS knows, not only at `\\n`', () => {
      expect(codeHasBranching('const a = 1; // note if (x) run();')).toBe(true);
      expect(codeHasBranching('const a = 1; // note\rif (x) run();')).toBe(true);
    });
  });

  it('a file with no branch and no comment has no branching', () => {
    const source = 'export abstract class Gateway {\n  public abstract run(): void;\n}';

    expect(codeHasBranching(source)).toBe(false);
  });

  // A guard that cannot read a file must not excuse it: before the fix the caller's `catch`
  // turned a scanner crash into "no logic, no test needed" (review 2026-10-03).
  describe('a source it cannot trust is judged with its comments in, never excused', () => {
    beforeEach(() => {
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('too deep for the parser, which overflows its stack', () => {
      const tooDeepToParse = '`${'.repeat(50_000);

      expect(codeHasBranching(`${tooDeepToParse}\nif (x) return;`)).toBe(true);
    });

    // The parser does not throw on a syntax error: it recovers, and the tree it hands back is
    // a guess. Here the stray backtick flips string and code, and the `if` was blanked as the
    // tail of a "comment" starting at `//h/` (review round 2, 2026-10-03).
    it('a syntax error, where the recovered tree is a guess', () => {
      const source = 'const s = `;\nconst url = `http://h/${p}`; if (a) b();\n';

      expect(codeHasBranching(source)).toBe(true);
    });

    it('says on stderr which source and why, as the other hook fallbacks do', () => {
      codeHasBranching('x /* if (a', 'src/billing/domain/fee.ts');

      expect(process.stderr.write).toHaveBeenCalledWith(
        "toolbox hooks: src/billing/domain/fee.ts judged with its comments in (syntax error at offset 10: '*/' expected.)\n",
      );
    });
  });
});
