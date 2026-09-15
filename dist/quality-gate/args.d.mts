export interface GateOptions {
    /** Re-freeze the numbers instead of comparing. */
    updateBaseline: boolean;
    /** Reuse the already-generated coverage report. */
    skipTests: boolean;
    /** Commit to read the baseline from (CI passes the PR's base). */
    baselineFrom?: string;
    /** File to write the report to. */
    out?: string;
}
/** Usage error - distinct from "the ratchet failed", which is `exit 1`. */
export declare class UsageError extends Error {
}
export declare function parseArgs(args: readonly string[]): GateOptions;
