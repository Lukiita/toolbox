import { describe, expect, it } from 'vitest';

import { explicitAnyCount, filesWithAny } from './any-count.mts';

describe('explicitAnyCount', () => {
  it('counts annotations, casts, generics and arrays', () => {
    const src = [
      'const a: any = 1;',
      'const b = a as any;',
      'const c: Array<any> = [];',
      'const d: any[] = [];',
      'function f(x: any): any {',
      '  return x;',
      '}',
    ].join('\n');
    expect(explicitAnyCount('x.ts', src)).toBe(6);
  });

  it('ignores the word in comments and strings', () => {
    const src = [
      '// any here, as any as it gets',
      "const s = 'as any';",
      'const n: number = 1;',
    ].join('\n');
    expect(explicitAnyCount('x.ts', src)).toBe(0);
  });

  it('parses tsx without choking on JSX', () => {
    expect(explicitAnyCount('x.tsx', 'export const f = (p: any) => <div>{p}</div>;')).toBe(1);
  });

  it('returns 0 for empty content', () => {
    expect(explicitAnyCount('x.ts', '')).toBe(0);
  });
});

describe('filesWithAny', () => {
  it('keeps only offenders, worst first, ties by path', () => {
    expect(
      filesWithAny([
        { file: 'b.ts', count: 2 },
        { file: 'c.ts', count: 0 },
        { file: 'a.ts', count: 2 },
        { file: 'd.ts', count: 5 },
      ]),
    ).toEqual([
      { file: 'd.ts', count: 5 },
      { file: 'a.ts', count: 2 },
      { file: 'b.ts', count: 2 },
    ]);
  });
});
