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
