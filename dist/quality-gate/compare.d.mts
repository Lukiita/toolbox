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
/** What only the engine may say about a metric: which way is worse, and whether it blocks. */
export type MetricSemantics = Pick<MetricBaseline, 'direction' | 'mode'> & {
    gate?: boolean;
};
/**
 * The baseline this run actually compares against when `--baseline-from`
 * points at ANOTHER revision (CI passes the pull request's base). Resolved
 * ONCE, so the comparison and the report can never disagree - the first
 * attempt threaded a fallback into the comparison alone, and the PR report
 * came out with every table empty.
 *
 * Three owners, split by what each is authoritative about:
 *
 *   - the ENGINE owns what a metric MEANS: `direction`, `mode` and `gate`.
 *     Those are facts about the measurement, not project data; `semantics`
 *     carries them from `METRIC_DEFAULTS`, which lives in compiled code.
 *   - the compared commit owns the NUMBER, under the metric's current key or
 *     the one it was renamed from (`renamedFrom`, also code: a map read from
 *     the baseline file would let the PR choose which frozen number it is
 *     measured against).
 *   - the local project owns the NAME: `section` and `label`, plus the report
 *     language - today's preference, not a frozen number.
 *
 * A metric the compared commit genuinely never had keeps the local floor and
 * is named in `fromLocalFloor`: that number is the one thing with no other
 * source, so the report says out loud that the PR is approving itself for it
 * rather than printing a silent green. The per-file map stays the compared
 * commit's: file names were not renamed, and the branch's own map would let a
 * file's regression approve itself.
 *
 * Provenance: born in project-b (2026-08-19) as reconcileBaselineFromRev,
 * brought to the toolbox by issue #1; project-a's copy then found four
 * self-approval routes in review (2026-09-02, rounds 4, 6, 7, 8 - each pinned
 * in compare.test.ts) and split it on the engine-versus-data axis. Ported
 * back by issue #8. Pure: takes both baselines, returns a new one.
 *
 * @example
 *   effectiveBaseline(base, own, LEGACY_METRIC_KEYS, METRIC_DEFAULTS)
 */
export declare function effectiveBaseline(compared: Baseline, local: Baseline, renamedFrom?: Readonly<Record<string, string>>, semantics?: Readonly<Record<string, MetricSemantics>>): {
    baseline: Baseline;
    fromLocalFloor: string[];
};
/**
 * Returns the metrics that regressed. A metric present in the measurement and
 * absent from the baseline **fails**: an incomplete baseline would be a gate
 * that approves what it does not know, and the fix (`--update-baseline`) is
 * one line. Feed it the result of `effectiveBaseline`, never a raw compared
 * commit: a metric this project renamed or adopted after that commit is
 * resolved there.
 */
export declare function compareMetrics(baseline: Baseline, current: Record<string, number>, t: GateStrings): Failure[];
