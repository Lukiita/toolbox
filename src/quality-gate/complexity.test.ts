import { describe, expect, it } from 'vitest';

import { functionComplexities, overComplexFunctions } from './complexity.mts';

const ccOf = (source: string) => functionComplexities('x.ts', source)[0]?.cc;

describe('functionComplexities', () => {
  it('a straight-line function is CC 1', () => {
    expect(ccOf('function f() { return 1; }')).toBe(1);
  });

  it('if / else if / else is CC 3 - the book example; else does not count', () => {
    const src = `function f(c1: number, c2: number): number {
      if (c1 < 100) return 0;
      else if (c1 + c2 > 500) return 1;
      else return -1;
    }`;
    expect(ccOf(src)).toBe(3);
  });

  it('short-circuit operators count: && || ??', () => {
    expect(
      ccOf('function f(a: boolean, b: boolean, c?: number) { return (a && b) || (c ?? 0); }'),
    ).toBe(4);
  });

  // ESLint's `complexity` rule counts these, and this module's header claims to follow it.
  // Missing them let `a = a || b` be rewritten as `a ||= b` for a free drop in score, which
  // walks the ratchet down without simplifying anything (review 2026-09-02).
  it('the logical assignment operators count too: ||= &&= ??=', () => {
    expect(ccOf('function f(a: number) { a ||= 1; a &&= 2; a ??= 3; return a; }')).toBe(4);
  });

  // Optional chaining and a default parameter each short-circuit, and ESLint's `complexity`
  // rule scores each +1 (measured against the installed ESLint 10.7.0). Without them
  // `a && a.b` -> `a?.b` bought a free point, the same loophole as `||=` and, with 1043 `?.`
  // tokens in src/, far more reachable (review 2026-09-02, round 4 — the owner chose parity
  // with ESLint over the narrower definition, and the baseline was re-frozen for it).
  it('optional chaining counts: ?. on a property, a call and an index', () => {
    expect(ccOf('function f(a?: { b?: number }) { return a?.b; }')).toBe(2);
    expect(ccOf('function f(a?: () => number) { return a?.(); }')).toBe(2);
    expect(ccOf('function f(a?: number[]) { return a?.[0]; }')).toBe(2);
  });

  // Both forms against a LITERAL, not against each other: an assertion whose two sides both
  // come from `ccOf` passes by construction if `ccOf` ever returns a constant. That is the
  // defect round 4 fixed in `entity.test.ts`, and it had survived one directory over
  // (review 2026-09-02, round 5).
  it('scores a?.b exactly as the a && a.b it replaces', () => {
    expect(ccOf('function f(a?: { b: number }) { return a?.b; }')).toBe(2);
    expect(ccOf('function f(a?: { b: number }) { return a && a.b; }')).toBe(2);
  });

  it('a default parameter is a branch: the argument came, or it did not', () => {
    expect(ccOf('function f(a: number = 1) { return a; }')).toBe(2);
    expect(ccOf('function f(a: number) { return a; }')).toBe(1);
  });

  // ESLint increments on every AssignmentPattern, and in a binding pattern the initialiser
  // sits on the BindingElement rather than the parameter. Missing it left the same walk-down
  // as `?.`: `f(o){ const a = o.a ?? 1 }` (CC 2) rewritten as `f({ a = 1 })` scored 1
  // (review 2026-09-02, round 5 — measured against ESLint 10.7.0 over all 145 src files).
  // ESLint scores a class field initialiser as its own unit. Not enumerating it meant the
  // decision points inside one belonged to no function at all — invisible complexity, which
  // is the very thing this metric exists to see (review 2026-09-02, round 5).
  it('a class field initialiser is scored on its own, like ESLint does', () => {
    const src = 'class C { private x = a ? b : (c && d); }';
    const all = functionComplexities('x.ts', src);
    expect(all.map((f) => f.cc)).toEqual([3]);
  });

  it('a class static block is scored on its own, like ESLint does', () => {
    const src = 'class C { static { if (a) b(); if (c) d(); } }';
    expect(functionComplexities('x.ts', src).map((f) => f.cc)).toEqual([3]);
  });

  it('a field holding an arrow scores the field and the arrow separately', () => {
    const all = functionComplexities('x.ts', 'class C { f = (a: number) => (a ? 1 : 2); }');
    expect(all.map((f) => f.cc)).toEqual([1, 2]);
  });

  it('a default inside a destructuring pattern counts the same as a plain one', () => {
    expect(ccOf('function f({ a = 1 }: { a?: number }) { return a; }')).toBe(2);
    expect(ccOf('function f([a = 1]: number[]) { return a; }')).toBe(2);
    expect(ccOf('function f(o: { a?: number }) { const { a = 1 } = o; return a; }')).toBe(2);
  });

  it('scores ||= exactly as the a = a || b it replaces', () => {
    expect(ccOf('function f(a: number) { a ||= 1; return a; }')).toBe(2);
    expect(ccOf('function f(a: number) { a = a || 1; return a; }')).toBe(2);
  });

  it('a switch counts one per case, not the default', () => {
    const src = `function f(x: number) {
      switch (x) {
        case 1: return 'a';
        case 2: return 'b';
        default: return 'c';
      }
    }`;
    expect(ccOf(src)).toBe(3);
  });

  it('loops and catch count', () => {
    const src = `function f(xs: number[]) {
      try {
        for (const x of xs) {
          while (x > 0) break;
        }
      } catch {
        return 0;
      }
      return 1;
    }`;
    expect(ccOf(src)).toBe(4);
  });

  // The guard was applied one level down but not to the function's own direct children, so a
  // curried arrow - whose entire body IS the nested function - handed its points to the
  // parent (review 2026-09-02).
  it('a curried arrow does not inherit its own body: the outer stays CC 1', () => {
    const all = functionComplexities('x.ts', 'const f = (a: number) => (b: number) => a && b;');
    expect(all.map((fn) => fn.cc)).toEqual([1, 2]);
  });

  it('nested functions score separately - the outer does not inherit the inner', () => {
    const src = `function outer(xs: number[]) {
      const inner = (x: number) => (x > 0 ? x : -x);
      return xs.map(inner);
    }`;
    const all = functionComplexities('x.ts', src);
    expect(all.map((f) => [f.name, f.cc])).toEqual([
      ['outer', 1],
      ['inner', 2],
    ]);
  });

  it('methods and constructors are measured with their names', () => {
    const src = `class A {
      constructor(private x: number) { if (x < 0) throw new Error('neg'); }
      public double(): number { return this.x * 2; }
    }`;
    const all = functionComplexities('x.ts', src);
    expect(all.map((f) => [f.name, f.cc])).toEqual([
      ['constructor', 2],
      ['double', 1],
    ]);
  });

  it('carries the 1-based line of each function', () => {
    const src = 'const a = 1;\nfunction f() { return a; }';
    expect(functionComplexities('x.ts', src)[0].line).toBe(2);
  });
});

describe('overComplexFunctions', () => {
  const mk = (name: string, cc: number, line = 1) => ({ file: 'x.ts', name, line, cc });

  it('keeps only offenders above the limit, worst first', () => {
    expect(
      overComplexFunctions([mk('a', 5), mk('b', 9), mk('c', 6)], 5).map((f) => f.name),
    ).toEqual(['b', 'c']);
  });

  it('an empty codebase has no offenders', () => {
    expect(overComplexFunctions([], 5)).toEqual([]);
  });
});

describe('config-driven limit (ADR-0001)', () => {
  it('the limit defaults to 5; a project tolerating 10 does not count a CC of 7', () => {
    const all = [{ file: 'src/a.ts', name: 'f', line: 1, cc: 7 }];
    expect(overComplexFunctions(all)).toHaveLength(1);
    expect(overComplexFunctions(all, 10)).toEqual([]);
  });
});
