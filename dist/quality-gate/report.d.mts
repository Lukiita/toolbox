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
}
export declare function buildReport(input: ReportInput, t: GateStrings): string;
