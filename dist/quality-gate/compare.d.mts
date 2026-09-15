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
export declare function compareFileCounts(baseline: Record<string, number>, current: Record<string, number>, t: GateStrings): Failure[];
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
export declare function reconcileBaselineFromRev(fromRev: Baseline, own: Baseline, legacyKeys?: Readonly<Record<string, string>>): Baseline;
/**
 * Returns the metrics that regressed. A metric present in the measurement and
 * absent from the baseline **fails**: an incomplete baseline would be a gate
 * that approves what it does not know, and the fix (`--update-baseline`) is
 * one line.
 */
export declare function compareMetrics(baseline: Baseline, current: Record<string, number>, t: GateStrings): Failure[];
