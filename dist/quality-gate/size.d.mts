export interface MeasuredFile {
    file: string;
    lines: number;
}
/**
 * Lines of a file, without counting the final newline as an extra empty
 * line - `"a\nb\n".split("\n")` returns 3 elements for 2 lines, and because
 * of that a file of exactly 400 was measured as 401 and failed at the limit.
 */
export declare function countLines(content: string): number;
/**
 * `.mts` and `.cts` are here because they were NOT, and a production module written in one was
 * invisible to every metric at once: 534 lines at cyclomatic complexity 60, `any`-typed and
 * uncovered, moved not a single number (review 2026-09-02, round 8, demonstrated). TypeScript
 * compiles them like any other module; the gate has to see them like any other module.
 */
export declare function isSizedFile(relPath: string, sourceWindow?: RegExp): boolean;
export interface SizeOptions {
    /** `quality.lineLimit`, default 400. */
    limit?: number;
    /** `quality.sourceWindow`, default `^src/`. */
    sourceWindow?: RegExp;
}
/** The ones past the limit, largest first. */
export declare function oversizedFiles(measured: readonly MeasuredFile[], { limit, sourceWindow, }?: SizeOptions): MeasuredFile[];
