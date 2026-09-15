import { describe, expect, it } from 'vitest';

import { type Baseline, compareMetrics, reconcileBaselineFromRev } from './compare.mts';
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
    expect(compareMetrics(BASE, { uncovered: 11 }, pt)[0].message).toContain(
      'passou de 10 para 11',
    );
  });
});

// The PR's base may not know a metric for two OPPOSITE reasons: it was RENAMED
// (and the real comparison has to survive) or it is NEW (and cannot be a
// regression, because there was nothing to get worse). This block pins both.
describe('reconcileBaselineFromRev', () => {
  const meta = {
    section: 'Coverage',
    label: 'Coverage',
    mode: 'baseline',
    direction: 'higher-is-better',
  } as const;

  const fromBase: Baseline = {
    metrics: { 'cobertura-percentual': { ...meta, value: 26.36 } },
    uncoveredByFile: { 'src/a.ts': 3 },
  };
  const fromBranch: Baseline = {
    metrics: {
      'coverage-percent': { ...meta, value: 34.37 },
      'circular-dependencies': {
        section: 'Violations',
        label: 'Cycles',
        mode: 'baseline',
        direction: 'lower-is-better',
        value: 0,
      },
    },
    uncoveredByFile: { 'src/a.ts': 3 },
  };
  const renamed = { 'coverage-percent': 'cobertura-percentual' };

  it('makes a renamed metric inherit the frozen VALUE of its old name', () => {
    const r = reconcileBaselineFromRev(fromBase, fromBranch, renamed);
    // 26.36, not 34.37: the limit that holds is the base's, or the branch approves itself.
    expect(r.metrics['coverage-percent'].value).toBe(26.36);
  });

  it("keeps the branch's label on a renamed metric, not the base's", () => {
    const oldLabel: Baseline = {
      metrics: { 'cobertura-percentual': { ...meta, label: 'old name', value: 26.36 } },
      uncoveredByFile: {},
    };
    const r = reconcileBaselineFromRev(oldLabel, fromBranch, renamed);
    expect(r.metrics['coverage-percent'].label).toBe('Coverage');
  });

  it('takes the RULE (mode, direction, gate) from the legacy entry, not the branch', () => {
    const softened: Baseline = {
      ...fromBranch,
      metrics: {
        ...fromBranch.metrics,
        'coverage-percent': { ...meta, direction: 'lower-is-better', gate: false, value: 34.37 },
      },
    };
    const r = reconcileBaselineFromRev(fromBase, softened, renamed);
    // A branch that flips the rule on the rename PR would approve itself.
    expect(r.metrics['coverage-percent'].direction).toBe('higher-is-better');
    expect(r.metrics['coverage-percent'].gate).toBeUndefined();
  });

  it('drops the legacy key once inherited - a leftover entry renders an empty table', () => {
    const r = reconcileBaselineFromRev(fromBase, fromBranch, renamed);
    expect(r.metrics['cobertura-percentual']).toBeUndefined();
  });

  it('adopts a new metric from the branch, because the base had nothing to worsen', () => {
    const r = reconcileBaselineFromRev(fromBase, fromBranch, {});
    expect(r.metrics['circular-dependencies'].value).toBe(0);
  });

  it('leaves a metric the base already knows untouched', () => {
    const r = reconcileBaselineFromRev(fromBase, fromBranch, {});
    expect(r.metrics['cobertura-percentual'].value).toBe(26.36);
  });

  it("keeps the base's per-file map - file names were not renamed", () => {
    const branch = { ...fromBranch, uncoveredByFile: { 'src/a.ts': 99 } };
    expect(reconcileBaselineFromRev(fromBase, branch, {}).uncoveredByFile).toEqual({
      'src/a.ts': 3,
    });
  });

  it("uses the branch's language, not the base's - language is a preference, not a frozen number", () => {
    const r = reconcileBaselineFromRev(fromBase, { ...fromBranch, language: 'pt' }, {});
    expect(r.language).toBe('pt');
  });

  it('after reconciling, a renamed metric FAILS again when it worsens', () => {
    const r = reconcileBaselineFromRev(fromBase, fromBranch, renamed);
    const failures = compareMetrics(r, { 'coverage-percent': 20 }, t);
    expect(failures).toHaveLength(1);
    expect(failures[0].limit).toBe(26.36);
  });

  it('does not mutate either input', () => {
    reconcileBaselineFromRev(fromBase, fromBranch, renamed);
    expect(fromBase.metrics).toEqual({ 'cobertura-percentual': { ...meta, value: 26.36 } });
    expect(Object.keys(fromBranch.metrics)).toEqual(['coverage-percent', 'circular-dependencies']);
  });
});
