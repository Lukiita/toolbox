import { describe, expect, it } from 'vitest';

import {
  InstallUsageError,
  parseInstallArguments,
  parseSelection,
  selectionMenu,
} from './install-arguments.mts';

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
      new InstallUsageError('unknown argument: --write-conflict'),
    );
  });
});

const CATALOG = [
  { name: 'code-review', summary: 'Reviews the branch diff.' },
  { name: 'ddd-tactical', summary: '' },
  { name: 'retro', summary: 'Looks back at a feature.' },
];
const NAMES = CATALOG.map((entry) => entry.name);

describe('selectionMenu', () => {
  it('numbers the skills, their lines starting in one column, and says how to answer', () => {
    expect(selectionMenu(CATALOG, '2.0.0')).toEqual([
      'Skills in @lukiita/toolbox 2.0.0:',
      '   1. code-review    Reviews the branch diff.',
      '   2. ddd-tactical',
      '   3. retro          Looks back at a feature.',
      'Which ones does this project get? Numbers or names, separated by spaces; or "all".',
    ]);
  });
});

describe('parseSelection', () => {
  it('takes numbers and names, mixed, once each', () => {
    expect(parseSelection('3 code-review 1', NAMES)).toEqual({
      names: ['retro', 'code-review'],
      all: false,
    });
  });

  it('takes commas as well as spaces', () => {
    expect(parseSelection('1, 2,retro', NAMES).names).toEqual([
      'code-review',
      'ddd-tactical',
      'retro',
    ]);
  });

  it('takes "all"', () => {
    expect(parseSelection(' all ', NAMES)).toEqual({ names: [], all: true });
  });

  it('selects nothing from an empty answer', () => {
    expect(parseSelection('  ', NAMES)).toEqual({ names: [], all: false });
  });

  it.each(['0', '4', 'sql-quality', '1.5'])(
    'refuses %j, which is no skill of the list',
    (token) => {
      expect(() => parseSelection(`1 ${token}`, NAMES)).toThrow(
        new InstallUsageError(
          `not a skill of the list: received ${JSON.stringify(token)}, expected a number from 1 to 3 or one of code-review, ddd-tactical, retro`,
        ),
      );
    },
  );
});
