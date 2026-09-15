import { describe, expect, it } from 'vitest';

import {
  type CoverageEntry,
  coveragePercent,
  isTestableFile,
  lineTotals,
  uncoveredInTestableFiles,
  uncoveredLines,
} from './coverage.mts';

function entry(lines: [line: number, executions: number][]): CoverageEntry {
  const statementMap: CoverageEntry['statementMap'] = {};
  const s: CoverageEntry['s'] = {};
  lines.forEach(([line, executions], i) => {
    statementMap[String(i)] = { start: { line }, end: { line } };
    s[String(i)] = executions;
  });
  return { statementMap, s };
}

describe('uncoveredLines', () => {
  it('returns the lines whose statements never ran', () => {
    expect(
      uncoveredLines(
        entry([
          [10, 3],
          [11, 0],
          [12, 0],
        ]),
      ),
    ).toEqual([11, 12]);
  });

  it('a line with one covered and one uncovered statement counts as covered', () => {
    expect(
      uncoveredLines(
        entry([
          [7, 0],
          [7, 1],
        ]),
      ),
    ).toEqual([]);
  });

  it('returns empty when everything ran', () => {
    expect(
      uncoveredLines(
        entry([
          [1, 1],
          [2, 5],
        ]),
      ),
    ).toEqual([]);
  });

  it('sorts, so the report never depends on JSON ordering', () => {
    expect(
      uncoveredLines(
        entry([
          [30, 0],
          [4, 0],
        ]),
      ),
    ).toEqual([4, 30]);
  });
});

describe('lineTotals', () => {
  it('counts instrumented lines and how many ran', () => {
    expect(
      lineTotals(
        entry([
          [1, 3],
          [2, 0],
          [3, 1],
        ]),
      ),
    ).toEqual({ total: 3, covered: 2 });
  });

  it('never counts the same line twice', () => {
    expect(
      lineTotals(
        entry([
          [5, 1],
          [5, 0],
        ]),
      ),
    ).toEqual({ total: 1, covered: 1 });
  });
});

describe('coveragePercent', () => {
  const identity = (p: string) => p;

  it('divides covered by instrumented lines, two decimal places', () => {
    const pct = coveragePercent(
      {
        'src/lib/a.ts': entry([
          [1, 1],
          [2, 1],
          [3, 0],
        ]),
      },
      identity,
    );
    expect(pct).toBe(66.67);
  });

  it('sums the whole repo, not the average of averages', () => {
    // 3 of 4 covered overall = 75%... with files of different sizes the two
    // calculations diverge - this is the case that pins the right one.
    const pct = coveragePercent(
      {
        'src/lib/big.ts': entry([
          [1, 1],
          [2, 1],
          [3, 1],
          [4, 0],
        ]),
        'src/lib/small.ts': entry([[1, 0]]),
      },
      identity,
    );
    expect(pct).toBe(60);
  });

  it('ignores non-testable files in the calculation', () => {
    const pct = coveragePercent(
      {
        'src/lib/a.ts': entry([[1, 1]]),
        'src/components/x.tsx': entry([
          [1, 0],
          [2, 0],
        ]),
      },
      identity,
    );
    expect(pct).toBe(100);
  });

  it('a repo with no statements counts as 100, not 0', () => {
    expect(coveragePercent({}, identity)).toBe(100);
  });
});

describe('isTestableFile', () => {
  it('accepts production .ts under src/', () => {
    expect(isTestableFile('src/lib/address.ts')).toBe(true);
    expect(isTestableFile('src/app/app/actions.ts')).toBe(true);
  });

  it('rejects .tsx, tests, declarations and anything outside src/', () => {
    expect(isTestableFile('src/components/shop-map.tsx')).toBe(false);
    expect(isTestableFile('src/lib/address.test.ts')).toBe(false);
    expect(isTestableFile('src/types.d.ts')).toBe(false);
    expect(isTestableFile('scripts/quality/gate.ts')).toBe(false);
  });
});

describe('uncoveredInTestableFiles', () => {
  const identity = (p: string) => p;

  it('sums per file and sorts by most uncovered', () => {
    const result = uncoveredInTestableFiles(
      {
        'src/lib/a.ts': entry([[1, 0]]),
        'src/lib/b.ts': entry([
          [1, 0],
          [2, 0],
        ]),
      },
      identity,
    );
    expect(result).toEqual([
      { file: 'src/lib/b.ts', lines: [1, 2], percent: 0 },
      { file: 'src/lib/a.ts', lines: [1], percent: 0 },
    ]);
  });

  it('carries the file own covered percentage', () => {
    const result = uncoveredInTestableFiles(
      {
        'src/lib/a.ts': entry([
          [1, 1],
          [2, 1],
          [3, 0],
        ]),
      },
      identity,
    );
    expect(result[0].percent).toBe(66.67);
  });

  it('drops non-testable files even when the map brings them', () => {
    const result = uncoveredInTestableFiles(
      { 'src/components/x.tsx': entry([[1, 0]]) },
      identity,
    );
    expect(result).toEqual([]);
  });

  it('omits fully covered files', () => {
    const result = uncoveredInTestableFiles({ 'src/lib/a.ts': entry([[1, 2]]) }, identity);
    expect(result).toEqual([]);
  });
});
