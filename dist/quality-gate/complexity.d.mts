export interface FunctionComplexity {
    file: string;
    name: string;
    line: number;
    cc: number;
}
/** Every function in one source file, with its own score. Pure. */
export declare function functionComplexities(relPath: string, source: string): FunctionComplexity[];
/** The offenders above `quality.ccLimit` (default 5), worst first, ties by position. */
export declare function overComplexFunctions(all: readonly FunctionComplexity[], limit?: number): FunctionComplexity[];
