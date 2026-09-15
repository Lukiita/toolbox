export type Language = 'en' | 'pt';
export interface GateStrings {
    reportTitle: string;
    statusPassed: string;
    statusFailed: (count: number) => string;
    baselineChangedNotice: readonly string[];
    tableHeader: string;
    regressionsTitle: string;
    ratchetAdvice: readonly string[];
    baselineOriginSuffix: (origin: string) => string;
    footer: (generatedAt: string, originSuffix: string) => string;
    metricNotInBaseline: (metric: string) => string;
    metricRegressed: (label: string, from: string, to: string, kind: string) => string;
    floorWord: string;
    baselineWord: string;
    fileRegressed: (file: string, from: number, to: number) => string;
    pureRulesTitle: (count: number, dirs: string) => string;
    filesOverLimitTitle: (limit: number, count: number) => string;
    explicitAnyTitle: (count: number) => string;
    uncoveredFilesTitle: (count: number) => string;
    uncoveredFileItem: (file: string, lines: number, percent: number) => string;
    overComplexTitle: (limit: number, count: number) => string;
    cyclesTitle: (count: number) => string;
}
/** Unknown or absent language falls back to English - never crashes the gate. */
export declare function stringsFor(language: string | undefined): GateStrings;
