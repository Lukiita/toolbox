import { describe, expect, it } from 'vitest';

import { duplicationStats } from './duplication.mts';

function report(percentage: number, clones: number) {
  return {
    statistics: { total: { clones, duplicatedLines: 132, percentage } },
  };
}

describe('duplicationStats', () => {
  it('extracts percentage and fragments', () => {
    expect(duplicationStats(report(2.2, 95))).toEqual({ percent: 2.2, fragments: 95 });
  });

  it('rounds to two decimal places - otherwise floating-point noise fails a PR that touched no duplication', () => {
    expect(duplicationStats(report(0.8849557522123894, 10)).percent).toBe(0.88);
  });

  it('accepts a repo with no duplication at all', () => {
    expect(duplicationStats(report(0, 0))).toEqual({ percent: 0, fragments: 0 });
  });
});
