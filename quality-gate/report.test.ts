import { describe, expect, it } from 'vitest';

import type { Baseline } from './compare.mts';
import { stringsFor } from './locale.mts';
import { buildReport, MARKER } from './report.mts';

const t = stringsFor('en');

const BASE: Baseline = {
  metrics: {
    'uncovered-lines': {
      section: 'Coverage',
      label: 'Uncovered lines',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 799,
      gate: false,
    },
    'duplication-percent': {
      section: 'Duplication',
      label: 'Duplicated lines',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 2.2,
      unit: '%',
    },
  },
  uncoveredByFile: {},
};

const INPUT = {
  baseline: BASE,
  current: { 'uncovered-lines': 799, 'duplication-percent': 2.2 },
  failures: [],
  generatedAt: '2026-08-05T12:00:00.000Z',
};

describe('buildReport', () => {
  it('opens with the marker, which is what lets CI edit the same comment', () => {
    expect(buildReport(INPUT, t).startsWith(MARKER)).toBe(true);
  });

  it('says passed when there is no failure', () => {
    expect(buildReport(INPUT, t)).toContain('**Status:** ✅ Passed');
  });

  it('says failed and counts the regressions', () => {
    const md = buildReport(
      {
        ...INPUT,
        failures: [
          { metric: 'a', limit: 208, current: 213, message: '`a` went up' },
          { metric: 'b', limit: 2, current: 3, message: '`b` went up' },
        ],
      },
      t,
    );
    expect(md).toContain('❌ Failed — 2 regression(s)');
    expect(md).toContain('### Regressions');
    expect(md).toContain('- `a` went up');
  });

  it('groups one table per section', () => {
    const md = buildReport(INPUT, t);
    expect(md).toContain('### Coverage');
    expect(md).toContain('### Duplication');
  });

  it('shows Δ with sign and suffix, and a dash when unchanged', () => {
    const md = buildReport(
      { ...INPUT, current: { 'uncovered-lines': 812, 'duplication-percent': 2.2 } },
      t,
    );
    expect(md).toContain('| Uncovered lines | 799 | 812 | +13 |');
    expect(md).toContain('| Duplicated lines | 2.2% | 2.2% | — |');
  });

  it('shows a negative Δ when improving', () => {
    const md = buildReport(
      { ...INPUT, current: { 'uncovered-lines': 780, 'duplication-percent': 2.04 } },
      t,
    );
    expect(md).toContain('| Uncovered lines | 799 | 780 | -19 |');
    expect(md).toContain('-0.16%');
  });

  it('warns when the PR touches the baseline itself', () => {
    const md = buildReport({ ...INPUT, baselineChanged: true }, t);
    expect(md).toContain('changes `quality-baseline.json`');
  });

  it('records where the baseline came from in the footer', () => {
    const md = buildReport({ ...INPUT, baselineOrigin: 'origin/main' }, t);
    expect(md).toContain('baseline from `origin/main`');
    expect(md).toContain('2026-08-05T12:00:00.000Z');
  });

  it('omits an empty detail instead of printing a hollow section', () => {
    const md = buildReport({ ...INPUT, details: [{ title: 'Nothing here', items: [] }] }, t);
    expect(md).not.toContain('Nothing here');
  });

  it('renders the whole chrome in portuguese when the project asks for pt', () => {
    const md = buildReport(
      { ...INPUT, failures: [{ metric: 'a', limit: 1, current: 2, message: 'x' }] },
      stringsFor('pt'),
    );
    expect(md).toContain('## Portão de qualidade');
    expect(md).toContain('❌ Reprovado — 1 regressão(ões)');
    expect(md).toContain('| Métrica | Baseline | Atual | Δ |');
    expect(md).toContain('### Regressões');
  });
});
