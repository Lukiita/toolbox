// Command-line parsing for the gate.
//
// Lives outside `main()` because it is the only part of it that decides
// anything - the rest is plumbing (spawn, read file, print). Extracted, it
// gets a test; inlined, only human eyes guaranteed that `--baseline-from`
// without a value would not become a silent `undefined`.

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
export class UsageError extends Error {}

/**
 * A flag that takes a value but got none **throws** instead of returning
 * `undefined`. Returning `undefined` would be worse than it looks in both
 * cases:
 *
 * - `--baseline-from` without a value makes the gate compare against the
 *   branch's own baseline without warning (the fallback notice only fires when
 *   a rev exists and failed), and CI would approve a regression against the
 *   wrong baseline;
 * - `--out` without a value writes no report, and the PR-comment step simply
 *   never happens - it vanishes without a sound.
 *
 * An absent flag still returns `undefined`: that is a choice, not a mistake.
 */
function flagValue(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    const received = value === undefined ? 'nothing' : `"${value}"`;
    throw new UsageError(`${flag} requires a value (received ${received}).`);
  }
  return value;
}

export function parseArgs(args: readonly string[]): GateOptions {
  return {
    updateBaseline: args.includes('--update-baseline'),
    skipTests: args.includes('--skip-tests'),
    baselineFrom: flagValue(args, '--baseline-from'),
    out: flagValue(args, '--out'),
  };
}
