import { describe, expect, it } from 'vitest';

import * as install from './index.mts';

describe('the public API of src/install', () => {
  // What is not exported here is private to the feature: code outside
  // src/install imports from this file and nowhere deeper.
  it('is the two commands, what each needs wired in, how arguments are read, the picker and their lines', () => {
    expect(Object.keys(install).sort()).toEqual([
      'DiskSkillFolders',
      'GitPastReleases',
      'SkillCommandUsageError',
      'availableLine',
      'gitFileDiff',
      'gitTextMerge',
      'inspectSkills',
      'inspectionLines',
      'installLine',
      'installSkills',
      'keyOf',
      'needsSelection',
      'parseInstallArguments',
      'parseSkillsArguments',
      'pickedSelection',
      'pickerLines',
      'pressKey',
      'repositoryCloneUrl',
      'selectionRequiredLines',
      'skillCatalog',
      'skillDiffs',
      'startPicker',
    ]);
  });
});
