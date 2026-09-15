import type { QualityConfig } from '../config/toolbox-config.mts';
import type { GateOptions } from './args.mts';
import { type Failure } from './compare.mts';
export interface GateEnvironment {
    root: string;
    config: QualityConfig;
    /** Where warnings go (stderr in the CLI). */
    warn: (message: string) => void;
}
export interface GateResult {
    /** `refrozen` = `--update-baseline` wrote the file; nothing was compared. */
    status: 'passed' | 'failed' | 'refrozen';
    failures: Failure[];
    current: Record<string, number>;
    /** The markdown report; absent when re-freezing. The caller writes `--out`. */
    report?: string;
}
/**
 * Runs the ratchet once. Never exits the process; the caller maps the status
 * and writes `--out` itself - so an unwritable path never loses the report
 * from the log (found in review).
 *
 * @example
 *   const result = runQualityGate({ root, config, warn: console.error }, { skipTests: true, updateBaseline: false });
 *   if (result.status === 'failed') process.exitCode = 1;
 */
export declare function runQualityGate(env: GateEnvironment, options: GateOptions): GateResult;
