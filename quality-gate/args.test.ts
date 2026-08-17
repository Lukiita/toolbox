import { describe, expect, it } from 'vitest';

import { parseArgs, UsageError } from './args.mts';

describe('parseArgs', () => {
  it('with no arguments, compares against the local baseline', () => {
    expect(parseArgs([])).toEqual({
      updateBaseline: false,
      skipTests: false,
      baselineFrom: undefined,
      out: undefined,
    });
  });

  it('reads the boolean flags', () => {
    const o = parseArgs(['--update-baseline', '--skip-tests']);
    expect(o.updateBaseline).toBe(true);
    expect(o.skipTests).toBe(true);
  });

  it('reads the value of flags that take one', () => {
    const o = parseArgs(['--baseline-from', 'abc123', '--out', 'report.md']);
    expect(o.baselineFrom).toBe('abc123');
    expect(o.out).toBe('report.md');
  });

  it('throws instead of swallowing the next flag as a value', () => {
    // Returning undefined here would make the gate compare against the
    // branch's own baseline without warning, and CI would approve a
    // regression against the wrong baseline. Usage errors must be loud.
    expect(() => parseArgs(['--baseline-from', '--out', 'report.md'])).toThrow(UsageError);
  });

  it('throws when the value is missing at the end of the line', () => {
    expect(() => parseArgs(['--baseline-from'])).toThrow(/requires a value/);
  });

  it('throws on an empty value', () => {
    expect(() => parseArgs(['--out', ''])).toThrow(UsageError);
  });

  it('--out without a value throws: with no report, the PR comment vanishes silently', () => {
    expect(() => parseArgs(['--out'])).toThrow(/--out requires a value/);
  });

  it('an absent flag stays undefined - that is a choice, not a mistake', () => {
    expect(parseArgs(['--skip-tests']).baselineFrom).toBeUndefined();
  });

  it('ignores unknown arguments instead of throwing', () => {
    expect(parseArgs(['--whatever']).updateBaseline).toBe(false);
  });
});
