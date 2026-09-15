import { type Baseline, type MetricBaseline } from './compare.mts';
export declare const BASELINE_FILE = "quality-baseline.json";
export declare const METRIC_DEFAULTS: Record<string, Omit<MetricBaseline, 'value'>>;
export declare const LEGACY_METRIC_KEYS: Readonly<Record<string, string>>;
/** The branch's own baseline, from the worktree. */
export declare function readOwnBaseline(root: string): Baseline;
export interface BaselineSource {
    base: Baseline;
    /** The rev it came from; undefined when it is the branch's own. */
    origin?: string;
}
/**
 * The baseline to compare against: the branch's own, or the one at `rev`
 * (CI passes the PR's base) reconciled with the branch's - a renamed key
 * keeps comparing under the old name, a new metric is adopted from the
 * branch. A rev with no baseline yet (the PR that introduces the ratchet)
 * falls back to the branch's own, and says so through `warn` so nobody reads
 * "passed" believing the base was compared.
 */
export declare function readComparisonBaseline(root: string, rev: string | undefined, warn: (message: string) => void): BaselineSource;
/** Whether the branch touched the baseline since `origin` - what the report warns about. */
export declare function baselineChangedSince(root: string, origin: string): boolean;
/**
 * Rebuilds the baseline from what was measured: an existing entry keeps its
 * metadata, a new one is born from the registered defaults, and a metric no
 * longer measured is pruned - stale entries would document a gate that no
 * longer exists. Re-freezing is already the deliberate, versioned action.
 */
export declare function refreezeBaseline(base: Baseline, current: Readonly<Record<string, number>>, byFile: Readonly<Record<string, number>>): Baseline;
/**
 * Writes the baseline json, two-space indented with a final newline - the
 * shape `--update-baseline` diffs cleanly in a pull request.
 *
 * @example
 *   writeBaseline(root, refreezeBaseline(readOwnBaseline(root), current, byFile))
 */
export declare function writeBaseline(root: string, baseline: Baseline): void;
