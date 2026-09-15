/** The slice of `coverage-final.json` (istanbul format) that matters here. */
export interface CoverageEntry {
    statementMap: Record<string, {
        start: {
            line: number;
        };
        end: {
            line: number;
        };
    }>;
    s: Record<string, number>;
}
export type CoverageMap = Record<string, CoverageEntry>;
export declare function uncoveredLines(entry: CoverageEntry): number[];
/** Instrumented lines and how many ran - the numerator and the denominator. */
export declare function lineTotals(entry: CoverageEntry): {
    total: number;
    covered: number;
};
/**
 * `true` for the files this repo can cover with a unit test: the production
 * window `size.mts` defines (so `.mts`/`.cts` count here too - a module the
 * size metric sees and the coverage metric does not would freeze coverage at
 * 100% on a repo made of them, found in review), minus `.tsx`.
 */
export declare function isTestableFile(relPath: string, sourceWindow?: RegExp): boolean;
export interface CoverageScope {
    /** Turns the absolute path istanbul records into the repo-relative one. */
    toRelativePath: (absolute: string) => string;
    /** `quality.sourceWindow`, default `^src/`. */
    sourceWindow?: RegExp;
}
export interface UncoveredByFile {
    file: string;
    lines: number[];
    /** The file's own covered percentage, for reading in the report. */
    percent: number;
}
/**
 * Repo line coverage over testable files only - the number everyone expects
 * to see. It pairs with the per-file map, never replaces it: the percentage
 * catches **dilution** (deleting well-tested code makes no file worse but
 * drops the average), and the map catches local regressions, which the
 * percentage dilutes as the repo grows.
 */
export declare function coveragePercent(map: CoverageMap, { toRelativePath, sourceWindow }: CoverageScope): number;
/**
 * Walks the whole map and returns, per testable file, the uncovered lines -
 * sorted by count, which is the order someone fixes them in.
 */
export declare function uncoveredInTestableFiles(map: CoverageMap, { toRelativePath, sourceWindow }: CoverageScope): UncoveredByFile[];
