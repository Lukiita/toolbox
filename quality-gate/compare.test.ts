import { describe, expect, it } from 'vitest';

import { type Baseline, compareMetrics } from './compare.mts';
import { stringsFor } from './locale.mts';

const t = stringsFor('en');

const BASE: Baseline = {
  metrics: {
    uncovered: {
      section: 'Coverage',
      label: 'Uncovered',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 10,
    },
    coverage: {
      section: 'Coverage',
      label: 'Coverage',
      mode: 'floor',
      direction: 'higher-is-better',
      value: 80,
    },
    informative: {
      section: 'Coverage',
      label: 'Informative',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 1,
      gate: false,
    },
  },
  uncoveredByFile: {},
};

describe('compareMetrics', () => {
  it('passes when tied with the baseline', () => {
    expect(compareMetrics(BASE, { uncovered: 10, coverage: 80 }, t)).toEqual([]);
  });

  it('passes when improving', () => {
    expect(compareMetrics(BASE, { uncovered: 4, coverage: 95 }, t)).toEqual([]);
  });

  it('fails a single unit of regression in lower-is-better', () => {
    const failures = compareMetrics(BASE, { uncovered: 11 }, t);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ metric: 'uncovered', limit: 10, current: 11 });
  });

  it('fails dropping below the floor in higher-is-better', () => {
    const failures = compareMetrics(BASE, { coverage: 79 }, t);
    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('floor');
  });

  it('calls it baseline in baseline mode and floor in floor mode', () => {
    expect(compareMetrics(BASE, { uncovered: 11 }, t)[0].message).toContain('baseline');
  });

  it('never fails a metric marked informative-only', () => {
    expect(compareMetrics(BASE, { informative: 999 }, t)).toEqual([]);
  });

  it('fails a metric absent from the baseline - the gate never approves what it does not know', () => {
    const failures = compareMetrics(BASE, { duplication: 3 }, t);
    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('--update-baseline');
  });

  it('localizes the failure message when the project asks for pt', () => {
    const pt = stringsFor('pt');
    expect(compareMetrics(BASE, { uncovered: 11 }, pt)[0].message).toContain('passou de 10 para 11');
  });
});
