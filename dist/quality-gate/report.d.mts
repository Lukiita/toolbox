import type { Baseline, Failure } from './compare.mts';
import type { GateStrings } from './locale.mts';
export declare const MARKER = "<!-- quality-gate -->";
export declare const REGRESSIONS_START = "<!-- regressions -->";
export declare const REGRESSIONS_END = "<!-- /regressions -->";
export interface ReportDetail {
    title: string;
    items: string[];
}
export interface ReportInput {
    baseline: Baseline;
    current: Record<string, number>;
    failures: readonly Failure[];
    details?: readonly ReportDetail[];
    generatedAt: string;
    /** Where the baseline came from: `origin/main` in CI, the worktree locally. */
    baselineOrigin?: string;
    /** The PR touched `quality-baseline.json` - needs human eyes. */
    baselineChanged?: boolean;
    /**
     * Metrics the compared commit never had, so the local floor stood in. They are printed
     * because a silent green on a self-compared metric is the hole `--baseline-from` exists to
     * close (project-a review 2026-09-02, issue #8).
     */
    localFloorMetrics?: readonly string[];
}
export declare function buildReport(input: ReportInput, t: GateStrings): string;
