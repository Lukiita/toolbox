import { describe, expect, it } from 'vitest';

import { countLines, isSizedFile, oversizedFiles } from './size.mts';

describe('isSizedFile', () => {
  it('accepts production .ts and .tsx under src/', () => {
    expect(isSizedFile('src/app/app/actions.ts')).toBe(true);
    expect(isSizedFile('src/components/panel/week-calendar.tsx')).toBe(true);
  });

  // A `.mts` under src/ is a production module TypeScript compiles like any other, and it was
  // invisible to all ten metrics: 534 lines at CC 60, full of `any` and uncovered, moved not
  // one number (review 2026-09-02, round 8, demonstrated).
  it('accepts .mts and .cts, which the extension check used to miss entirely', () => {
    expect(isSizedFile('src/utils/loader.mts')).toBe(true);
    expect(isSizedFile('src/utils/legacy.cts')).toBe(true);
    expect(isSizedFile('src/utils/loader.test.mts')).toBe(false);
    expect(isSizedFile('src/types/global.d.mts')).toBe(false);
  });

  it('rejects tests - a big test is a case table, and charging pushes the wrong way', () => {
    expect(isSizedFile('src/lib/address.test.ts')).toBe(false);
    expect(isSizedFile('src/app/x.test.tsx')).toBe(false);
  });

  it('rejects declarations and anything outside src/', () => {
    expect(isSizedFile('src/types.d.ts')).toBe(false);
    expect(isSizedFile('scripts/quality/gate.ts')).toBe(false);
    expect(isSizedFile('supabase/tests/rls.test.sql')).toBe(false);
  });
});

describe('oversizedFiles', () => {
  const measured = [
    { file: 'src/a.ts', lines: 401 },
    { file: 'src/b.ts', lines: 400 },
    { file: 'src/c.tsx', lines: 733 },
    { file: 'src/d.test.ts', lines: 900 },
  ];

  it('catches whoever passed the limit, exclusive', () => {
    expect(oversizedFiles(measured, { limit: 400 }).map((m) => m.file)).toEqual([
      'src/c.tsx',
      'src/a.ts',
    ]);
  });

  it('sorts largest first', () => {
    expect(oversizedFiles(measured, { limit: 400 })[0].lines).toBe(733);
  });

  it('honors a custom limit', () => {
    expect(oversizedFiles(measured, { limit: 800 })).toEqual([]);
  });

  it('ignores a test file even when huge', () => {
    expect(oversizedFiles(measured, { limit: 400 }).map((m) => m.file)).not.toContain(
      'src/d.test.ts',
    );
  });
});

describe('countLines', () => {
  it('does not count the final newline as an extra line', () => {
    // "a\nb\n".split("\n") gives 3 elements for 2 lines, and because of that
    // a file of exactly 400 was measured as 401 and failed at the limit.
    expect(countLines('a\nb\n')).toBe(2);
  });

  it('counts right without a final newline', () => {
    expect(countLines('a\nb')).toBe(2);
  });

  it('an empty file has zero lines', () => {
    expect(countLines('')).toBe(0);
  });

  it('a single-line file', () => {
    expect(countLines('one\n')).toBe(1);
  });

  it('an empty line in the middle counts', () => {
    expect(countLines('a\n\nb\n')).toBe(3);
  });
});

describe('config-driven window and limit (ADR-0001)', () => {
  const MONOREPO = /^apps\/[^/]+\/src\//;

  it('a monorepo window accepts its own layout and the default rejects it', () => {
    expect(isSizedFile('apps/backend/src/x.ts', MONOREPO)).toBe(true);
    expect(isSizedFile('apps/backend/src/x.ts')).toBe(false);
    expect(isSizedFile('src/x.ts', MONOREPO)).toBe(false);
  });

  it('the limit defaults to 400 and the window travels with it', () => {
    expect(oversizedFiles([{ file: 'src/a.ts', lines: 401 }])).toHaveLength(1);
    expect(oversizedFiles([{ file: 'src/a.ts', lines: 400 }])).toHaveLength(0);
    expect(
      oversizedFiles([{ file: 'apps/api/src/a.ts', lines: 999 }], { sourceWindow: MONOREPO }),
    ).toHaveLength(1);
    expect(oversizedFiles([{ file: 'apps/api/src/a.ts', lines: 999 }])).toHaveLength(0);
  });
});
