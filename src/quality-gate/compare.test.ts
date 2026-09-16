import { describe, expect, it } from 'vitest';

import { type Baseline, compareMetrics, effectiveBaseline } from './compare.mts';
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

// A run with `--baseline-from <rev>` compares against an OLDER commit, which legitimately
// predates a metric this project has since adopted - or knows it under the key it had before
// a rename. Resolving that ONCE, into the baseline both the comparison and the report use, is
// what keeps the two from disagreeing: the first attempt threaded a fallback into the
// comparison only, and the PR report came out with every table empty (project-a review
// 2026-09-02, ported by issue #8 over the toolbox's own reconcileBaselineFromRev, issue #1).
describe('effectiveBaseline', () => {
  const LOCAL: Baseline = {
    language: 'pt',
    metrics: {
      'coverage-percent': {
        section: 'Cobertura',
        label: 'Cobertura de linhas',
        mode: 'baseline',
        direction: 'higher-is-better',
        value: 90,
        unit: '%',
      },
      adopted: {
        section: 'Tipos',
        label: 'Adotada depois do commit-base',
        mode: 'baseline',
        direction: 'lower-is-better',
        value: 5,
      },
    },
    uncoveredByFile: { 'src/a.ts': 99 },
  };

  const COMPARED: Baseline = {
    metrics: {
      'cobertura-percentual': {
        section: 'Coverage',
        label: 'Line coverage',
        mode: 'baseline',
        direction: 'higher-is-better',
        value: 80,
        unit: '%',
      },
    },
    uncoveredByFile: { 'src/a.ts': 3 },
  };

  const RENAMED = { 'coverage-percent': 'cobertura-percentual' };

  it('takes the number from the key the metric was renamed from', () => {
    const { baseline } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(baseline.metrics['coverage-percent'].value).toBe(80);
  });

  it('keeps the local metadata - the compared commit does not name this project metrics', () => {
    const { baseline } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(baseline.metrics['coverage-percent'].label).toBe('Cobertura de linhas');
    expect(baseline.metrics['coverage-percent'].section).toBe('Cobertura');
  });

  it('keeps the local floor for a metric the compared commit never had, and names it', () => {
    const { baseline, fromLocalFloor } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(baseline.metrics.adopted.value).toBe(5);
    expect(fromLocalFloor).toEqual(['adopted']);
  });

  it('renders every metric, so the report can never come out with an empty table', () => {
    const { baseline } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(Object.keys(baseline.metrics)).toEqual(['coverage-percent', 'adopted']);
  });

  it('drops the legacy key once inherited - a leftover entry renders an empty table', () => {
    const { baseline } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(baseline.metrics['cobertura-percentual']).toBeUndefined();
  });

  it('is the identity when there is nothing to compare against but itself', () => {
    const { baseline, fromLocalFloor } = effectiveBaseline(LOCAL, LOCAL, RENAMED);
    expect(baseline.metrics).toEqual(LOCAL.metrics);
    expect(fromLocalFloor).toEqual([]);
  });

  it('a renamed metric that regressed against the base still fails', () => {
    const { baseline } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    const failures = compareMetrics(baseline, { 'coverage-percent': 79 }, t);
    expect(failures.map((f) => f.metric)).toEqual(['coverage-percent']);
    expect(failures[0].limit).toBe(80);
  });

  it("keeps the compared commit's per-file map - file names were not renamed, and the branch's own map would approve itself", () => {
    const { baseline } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(baseline.uncoveredByFile).toEqual({ 'src/a.ts': 3 });
  });

  it("uses the branch's language, not the base's - language is a preference, not a frozen number", () => {
    const { baseline } = effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(baseline.language).toBe('pt');
  });

  it('does not mutate either input', () => {
    effectiveBaseline(COMPARED, LOCAL, RENAMED);
    expect(Object.keys(COMPARED.metrics)).toEqual(['cobertura-percentual']);
    expect(Object.keys(LOCAL.metrics)).toEqual(['coverage-percent', 'adopted']);
  });
});

const meta = (over: Partial<Baseline['metrics'][string]> = {}) => ({
  section: 'S',
  label: 'L',
  mode: 'baseline' as const,
  direction: 'lower-is-better' as const,
  value: 10,
  ...over,
});

describe('effectiveBaseline - presentation is local, enforcement is not', () => {
  // `--baseline-from` exists so a re-freezing PR cannot approve itself. Taking `gate`,
  // `direction`, `mode` and the value from the local file moved that self-approval from the
  // number to the flags: a PR could switch its own metric off (review 2026-09-02, round 4).
  it('keeps the compared commit gate flag, so a PR cannot switch its own metric off', () => {
    const local: Baseline = { metrics: { m: meta({ gate: false }) }, uncoveredByFile: {} };
    const compared: Baseline = { metrics: { m: meta({ gate: true }) }, uncoveredByFile: {} };
    const { baseline } = effectiveBaseline(compared, local);
    expect(baseline.metrics.m.gate).toBe(true);
    expect(compareMetrics(baseline, { m: 999 }, t).map((f) => f.metric)).toEqual(['m']);
  });

  it('keeps the compared commit direction and mode', () => {
    const local: Baseline = {
      metrics: { m: meta({ direction: 'higher-is-better', mode: 'floor' }) },
      uncoveredByFile: {},
    };
    const compared: Baseline = { metrics: { m: meta() }, uncoveredByFile: {} };
    const { baseline } = effectiveBaseline(compared, local);
    expect(baseline.metrics.m.direction).toBe('lower-is-better');
    expect(baseline.metrics.m.mode).toBe('baseline');
  });

  it('still takes section and label from the local file - that is what a reader sees', () => {
    const local: Baseline = {
      metrics: { m: meta({ label: 'Rótulo', section: 'Seção' }) },
      uncoveredByFile: {},
    };
    const compared: Baseline = { metrics: { m: meta() }, uncoveredByFile: {} };
    const { baseline } = effectiveBaseline(compared, local);
    expect([baseline.metrics.m.label, baseline.metrics.m.section]).toEqual(['Rótulo', 'Seção']);
  });

  // One typo in a hand-maintained map made two metrics read the same old number, with an
  // empty `fromLocalFloor` and a silent green (review 2026-09-02, round 4).
  it('refuses a rename map that points two metrics at the same old key', () => {
    const local: Baseline = { metrics: { a: meta(), b: meta() }, uncoveredByFile: {} };
    const compared: Baseline = { metrics: { old: meta() }, uncoveredByFile: {} };
    expect(() => effectiveBaseline(compared, local, { a: 'old', b: 'old' })).toThrow(/old/);
  });
});

// `--baseline-from` exists so a re-freezing PR cannot approve itself. Round 4 moved `gate` to
// the compared commit for that reason - but a metric that commit has never heard of kept the
// LOCAL entry wholesale, `gate` included. Demonstrated: setting `gate:false` on the three
// metrics `main` lacks made the gate exit 0 and print "Aprovado" while `cc-over-limit` and
// `explicit-any` were visibly worse in the same table (review 2026-09-02, round 6).
describe('effectiveBaseline - a metric on the local floor always gates', () => {
  const LOCAL_OFF: Baseline = { metrics: { novo: meta({ gate: false }) }, uncoveredByFile: {} };
  const WITHOUT_THE_METRIC: Baseline = { metrics: {}, uncoveredByFile: {} };

  it('ignores a local gate:false when the compared commit has no entry to vouch for it', () => {
    const { baseline, fromLocalFloor } = effectiveBaseline(WITHOUT_THE_METRIC, LOCAL_OFF);
    expect(fromLocalFloor).toEqual(['novo']);
    expect(baseline.metrics.novo.gate).toBe(true);
    expect(compareMetrics(baseline, { novo: 11 }, t).map((f) => f.metric)).toEqual(['novo']);
  });

  it('still honours gate:false when the compared commit carries it', () => {
    const compared: Baseline = { metrics: { novo: meta({ gate: false }) }, uncoveredByFile: {} };
    const { baseline } = effectiveBaseline(compared, LOCAL_OFF);
    expect(compareMetrics(baseline, { novo: 11 }, t)).toEqual([]);
  });
});

// Two more self-approval routes survived round 6, both because ENFORCEMENT semantics still
// came from a file the pull request edits: flipping `direction` on a local-floor metric, and
// re-pointing the rename map at an unrelated old key that happens to carry `gate: false`. The
// split was on the wrong axis. The engine owns what a metric MEANS (direction, mode, gate),
// the baseline owns only the NUMBER, and the project owns the NAME (review 2026-09-02, round 7).
describe('effectiveBaseline - the engine owns what a metric means', () => {
  const SEMANTICS = {
    m: { direction: 'lower-is-better' as const, mode: 'baseline' as const },
    lenient: { direction: 'lower-is-better' as const, mode: 'baseline' as const, gate: false },
  };
  const NOTHING: Baseline = { metrics: {}, uncoveredByFile: {} };

  it('ignores a direction flipped in the local file for a metric on the local floor', () => {
    const local: Baseline = {
      metrics: { m: meta({ direction: 'higher-is-better' }) },
      uncoveredByFile: {},
    };
    const { baseline } = effectiveBaseline(NOTHING, local, {}, SEMANTICS);
    expect(baseline.metrics.m.direction).toBe('lower-is-better');
    expect(compareMetrics(baseline, { m: 11 }, t).map((f) => f.metric)).toEqual(['m']);
  });

  it('ignores a direction flipped in the compared commit as well', () => {
    const local: Baseline = { metrics: { m: meta() }, uncoveredByFile: {} };
    const compared: Baseline = {
      metrics: { m: meta({ direction: 'higher-is-better' }) },
      uncoveredByFile: {},
    };
    const { baseline } = effectiveBaseline(compared, local, {}, SEMANTICS);
    expect(compareMetrics(baseline, { m: 11 }, t).map((f) => f.metric)).toEqual(['m']);
  });

  // No `gate` edited anywhere: the rename simply points at a key that already carries it.
  it('does not let a rename inherit gate:false from an unrelated old key', () => {
    const local: Baseline = { metrics: { m: meta() }, uncoveredByFile: {} };
    const compared: Baseline = {
      metrics: { outra: meta({ gate: false, value: 10 }) },
      uncoveredByFile: {},
    };
    const { baseline } = effectiveBaseline(compared, local, { m: 'outra' }, SEMANTICS);
    expect(baseline.metrics.m.gate).not.toBe(false);
    expect(compareMetrics(baseline, { m: 11 }, t).map((f) => f.metric)).toEqual(['m']);
  });

  it('still honours a gate:false the ENGINE declares', () => {
    const local: Baseline = { metrics: { lenient: meta() }, uncoveredByFile: {} };
    const compared: Baseline = { metrics: { lenient: meta() }, uncoveredByFile: {} };
    const { baseline } = effectiveBaseline(compared, local, {}, SEMANTICS);
    expect(compareMetrics(baseline, { lenient: 999 }, t)).toEqual([]);
  });
});

// A pull request could re-point the rename map at ANY old key and inherit its number: pointing
// `circular-dependencies` at `linhas-descobertas` (150 on main) printed
// `| Dependências circulares | 150 | 1 | -149 |` and exited 0, with a real import cycle in the
// tree and no local-floor notice naming it (review 2026-09-02, round 8). No runtime assertion
// pins that: the map lives in code (LEGACY_METRIC_KEYS in baseline-store.mts), and what guards
// it is the TYPE - `renamedFrom` is not part of Baseline, so reading a rename out of the
// baseline file cannot compile. This fails the build the day someone puts the field back.
describe('renames cannot come from the baseline file at all', () => {
  it('refuses a rename map on a Baseline - the map lives in the engine, beside METRIC_DEFAULTS', () => {
    const withMap: Baseline = {
      metrics: {},
      // @ts-expect-error - `renamedFrom` is deliberately not part of Baseline (round 8)
      renamedFrom: { target: 'generous' },
      uncoveredByFile: {},
    };
    expect(Object.keys(withMap.metrics)).toEqual([]);
  });
});
