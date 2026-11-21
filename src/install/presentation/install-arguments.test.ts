import { describe, expect, it } from 'vitest';

import { catalogLines, InstallUsageError, parseInstallArguments } from './install-arguments.mts';

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

describe('catalogLines', () => {
  it('lists the skills, their lines starting in one column', () => {
    const catalog = [
      { name: 'code-review', summary: 'Reviews the branch diff.' },
      { name: 'ddd-tactical', summary: '' },
      { name: 'retro', summary: 'Looks back at a feature.' },
    ];
    expect(catalogLines(catalog, '2.0.0')).toEqual([
      'Skills in @lukiita/toolbox 2.0.0:',
      '  code-review    Reviews the branch diff.',
      '  ddd-tactical',
      '  retro          Looks back at a feature.',
    ]);
  });
});
