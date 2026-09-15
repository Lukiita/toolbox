/** The slice of `jscpd-report.json` that matters. */
export interface JscpdReport {
    statistics: {
        total: {
            clones: number;
            duplicatedLines: number;
            percentage: number;
        };
    };
}
export interface DuplicationStats {
    /** Duplicated-lines percentage, two decimal places. */
    percent: number;
    /** Number of cloned fragments. */
    fragments: number;
}
export declare function duplicationStats(report: JscpdReport): DuplicationStats;
