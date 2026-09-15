import type { QualityConfig } from '../config/toolbox-config.mts';
import { type FileAnyCount } from './any-count.mts';
import { type FunctionComplexity } from './complexity.mts';
import { type UncoveredByFile } from './coverage.mts';
import { type MeasuredFile } from './size.mts';
export interface Measurement {
    /** Metric name -> value, the keys the baseline json uses. */
    current: Record<string, number>;
    /** Per-file uncovered lines, the per-file ratchet. */
    byFile: Record<string, number>;
    displacedRules: string[];
    cycles: string[][];
    oversized: MeasuredFile[];
    complexFns: FunctionComplexity[];
    anys: FileAnyCount[];
    uncovered: UncoveredByFile[];
}
export interface MeasureOptions {
    root: string;
    config: QualityConfig;
    /** Reuse the coverage json already on disk instead of running the suite. */
    skipTests: boolean;
}
/**
 * Every versioned file plus the untracked ones git does not ignore.
 *
 * @example
 *   projectFiles(root) // => ['src/a.ts', 'src/a.test.ts', ...]
 */
export declare function projectFiles(root: string): string[];
/**
 * Measures the repository at `root` with the project's config.
 *
 * @example
 *   const { current } = measureRepository({ root, config, skipTests: true });
 *   current['files-over-limit'] // => 3
 */
export declare function measureRepository({ root, config, skipTests }: MeasureOptions): Measurement;
