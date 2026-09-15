import { isSizedFile } from './size.mts';
export interface FileAnyCount {
    file: string;
    count: number;
}
/** `any` keyword nodes in one source. Pure - feed it any content. */
export declare function explicitAnyCount(relPath: string, source: string): number;
/** Which files enter the count - the exact window `size.mts` measures. */
export declare const isAnyCheckedFile: typeof isSizedFile;
/** Files that still carry `any`, worst first, ties by path. */
export declare function filesWithAny(measured: readonly FileAnyCount[]): FileAnyCount[];
