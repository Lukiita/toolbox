// Comparison against the baseline - the heart of the ratchet.
//
// Two modes, because a new project and an existing one need different things:
//
//   - `baseline`: freezes the value measured today and forbids getting worse.
//     The mode for a repo with a past - you don't fix everything at once, but
//     you don't add more debt either.
//   - `floor`: requires a chosen minimum/maximum, regardless of what exists.
//     The mode for a fresh repo, where there is no past to freeze and "no
//     worse" would be vacuously true.
//
// The golden rule is the one from the video that originated this: a PR may add
// code, but may not worsen any metric - not even by one unit.

import type { GateStrings } from './locale.mts';

export type Direction = 'lower-is-better' | 'higher-is-better';

export interface MetricBaseline {
  /** Groups the metric in the report table. */
  section: string;
  /** How the metric shows in the "Metric" column. */
  label: string;
  mode: 'baseline' | 'floor';
  direction: Direction;
  value: number;
  /** Suffix in the table. Percentages compare with two decimal places. */
  unit?: '%';
  /** `false` = shows in the table but never fails the gate. */
  gate?: boolean;
  /** Documentation only: what the number means and why it holds this value. */
  note?: string;
}

export interface Baseline {
  /** Report language for this project ('en' when absent). */
  language?: string;
  metrics: Record<string, MetricBaseline>;
  /** Per-file ratchet: relative path → accepted uncovered lines. */
  uncoveredByFile: Record<string, number>;
}

export interface Failure {
  metric: string;
  limit: number;
  current: number;
  message: string;
}

function worsened(direction: Direction, limit: number, current: number): boolean {
  return direction === 'lower-is-better' ? current > limit : current < limit;
}

/**
 * Per-file ratchet. It exists because the global sum does NOT work: measured
 * on 2026-08-05 against `e6d4144`, `actions.ts` went from 208 to 213 uncovered
 * lines - the regression CodeRabbit flagged - while the repo total dropped
 * from 799 to 792, because the same feature covered other things. A single
 * number lets the local regression hide behind someone else's improvement.
 *
 * A file absent from the baseline counts as 0: new code with uncovered lines
 * is exactly the case to catch. When deliberate, re-freeze.
 */
export function compareFileCounts(
  baseline: Record<string, number>,
  current: Record<string, number>,
  t: GateStrings,
): Failure[] {
  const failures: Failure[] = [];
  for (const [file, value] of Object.entries(current)) {
    const limit = baseline[file] ?? 0;
    if (value <= limit) continue;
    failures.push({
      metric: file,
      limit,
      current: value,
      message: t.fileRegressed(file, limit, value),
    });
  }
  return failures.sort((a, b) => b.current - b.limit - (a.current - a.limit));
}

/**
 * Reconciles a baseline read from ANOTHER revision (`--baseline-from`, which
 * CI points at the pull request's base) with the branch's own.
 *
 * It exists because comparing against the base has two blind spots that both
 * look like "metric is not in the baseline", while meaning opposite things:
 *
 * 1. **A renamed metric.** The base still calls it `cobertura-percentual`,
 *    the branch measures `coverage-percent`. Without the mapping the ratchet
 *    would lose the real comparison exactly on the pull request that renames
 *    the keys - the moment it is most needed. `legacyKeys` restores it: the
 *    old entry answers for the new name, at its frozen value.
 * 2. **A genuinely new metric.** The base never measured circular
 *    dependencies, so its absence is not a regression - there is nothing to
 *    have got worse. The branch's own entry takes over, and the "this pull
 *    request changes quality-baseline.json" diff is what puts a human on the
 *    re-freeze.
 *
 * What it deliberately does NOT do: soften the local run. With no
 * `--baseline-from`, an unregistered metric still fails loudly - there the
 * absence means someone added a collector and never froze it.
 *
 * Born in project-b (2026-08-19), brought back here by toolbox issue #1.
 * Pure: takes both baselines, returns a new one.
 *
 * @example
 *   reconcileBaselineFromRev(base, own, { 'coverage-percent': 'cobertura-percentual' })
 */
export function reconcileBaselineFromRev(
  fromRev: Baseline,
  own: Baseline,
  legacyKeys: Readonly<Record<string, string>> = {},
): Baseline {
  const metrics: Record<string, MetricBaseline> = { ...fromRev.metrics };
  for (const [name, ownMeta] of Object.entries(own.metrics)) {
    if (name in metrics) continue;
    const legacy = legacyKeys[name];
    const inherited = legacy ? fromRev.metrics[legacy] : undefined;
    if (!inherited) {
      metrics[name] = ownMeta;
      continue;
    }
    // The legacy entry keeps the RULE - value, mode, direction, gate: taken
    // from the branch, a flipped direction or `gate: false` on the rename PR
    // would let the branch approve itself. Only label and section are the
    // branch's - the old ones may be in another language. The legacy key
    // itself goes: left in, the report renders an empty table under the old
    // section for a metric nothing measures anymore.
    metrics[name] = { ...inherited, label: ownMeta.label, section: ownMeta.section };
    delete metrics[legacy as string];
  }
  // `language` comes from the branch, not the base: the report language is
  // today's preference, not a frozen number. Taken from the base, a PR against
  // a main older than the language choice printed the header in English and
  // the sections in Portuguese, because label and section come from each
  // metric's own metadata.
  return { ...fromRev, language: own.language, metrics };
}

/**
 * Returns the metrics that regressed. A metric present in the measurement and
 * absent from the baseline **fails**: an incomplete baseline would be a gate
 * that approves what it does not know, and the fix (`--update-baseline`) is
 * one line.
 */
export function compareMetrics(
  baseline: Baseline,
  current: Record<string, number>,
  t: GateStrings,
): Failure[] {
  const failures: Failure[] = [];
  for (const [metric, value] of Object.entries(current)) {
    const expected = baseline.metrics[metric];
    if (!expected) {
      failures.push({
        metric,
        limit: Number.NaN,
        current: value,
        message: t.metricNotInBaseline(metric),
      });
      continue;
    }
    if (expected.gate === false) continue;
    if (!worsened(expected.direction, expected.value, value)) continue;
    const suffix = expected.unit ?? '';
    const kind = expected.mode === 'floor' ? t.floorWord : t.baselineWord;
    failures.push({
      metric,
      limit: expected.value,
      current: value,
      message: t.metricRegressed(
        expected.label,
        `${expected.value}${suffix}`,
        `${value}${suffix}`,
        kind,
      ),
    });
  }
  return failures;
}
