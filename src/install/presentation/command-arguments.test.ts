import { describe, expect, it } from 'vitest';

import { SkillCommandUsageError } from '../application/usage-error.mts';
import { parseInstallArguments, parseSkillsArguments } from './command-arguments.mts';

describe('parseInstallArguments', () => {
  it('asks for nothing new with no arguments', () => {
    expect(parseInstallArguments([])).toEqual({ names: [], all: false, writeConflicts: false });
  });

  it('takes the words as skill names and the flags as flags, in any order', () => {
    expect(parseInstallArguments(['code-review', '--write-conflicts', 'ddd-tactical'])).toEqual({
      names: ['code-review', 'ddd-tactical'],
      all: false,
      writeConflicts: true,
    });
    expect(parseInstallArguments(['--all'])).toEqual({
      names: [],
      all: true,
      writeConflicts: false,
    });
  });

  // `--write-conflict` read as "no flag" would leave the conflict unwritten and say nothing.
  it('refuses a flag it does not know instead of ignoring it', () => {
    expect(() => parseInstallArguments(['--write-conflict'])).toThrow(
      new SkillCommandUsageError('unknown argument: --write-conflict'),
    );
  });

  it("refuses the other command's flag", () => {
    expect(() => parseInstallArguments(['--diff'])).toThrow(
      new SkillCommandUsageError('unknown argument: --diff'),
    );
  });
});

describe('parseSkillsArguments', () => {
  it('prints no diff unless asked to', () => {
    expect(parseSkillsArguments([])).toEqual({ diff: false });
    expect(parseSkillsArguments(['--diff'])).toEqual({ diff: true });
  });

  it.each(['--dif', '--all', 'code-review'])('refuses %j: the command takes only --diff', (arg) => {
    expect(() => parseSkillsArguments([arg])).toThrow(
      new SkillCommandUsageError(`unknown argument: ${arg}`),
    );
  });
});
