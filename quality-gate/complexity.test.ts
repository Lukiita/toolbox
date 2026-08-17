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
    expect(ccOf('function f(a: boolean, b: boolean, c?: number) { return (a && b) || (c ?? 0); }')).toBe(4);
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
    expect(overComplexFunctions([mk('a', 5), mk('b', 9), mk('c', 6)], 5).map((f) => f.name)).toEqual([
      'b',
      'c',
    ]);
  });

  it('an empty codebase has no offenders', () => {
    expect(overComplexFunctions([], 5)).toEqual([]);
  });
});
