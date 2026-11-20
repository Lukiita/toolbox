import { describe, expect, it } from 'vitest';

import type { TextMerge } from './merge-skill-trees.mts';
import { type ReconcileOptions, reconcileSkill, type SkillSides } from './reconcile-skill.mts';
import { treeOf } from './skill-tree.fixtures.ts';

const V1 = treeOf({ 'SKILL.md': 'v1' });
const V2 = treeOf({ 'SKILL.md': 'v2' });
const EDITED = treeOf({ 'SKILL.md': 'v1 edited by the project' });

const neverMerges: TextMerge = () => {
  throw new Error('unexpected text merge');
};
const cleanMerge: TextMerge = ({ ours, theirs }) => ({
  text: `${ours} + ${theirs}`,
  conflicted: false,
});
const conflictingMerge: TextMerge = () => ({ text: '<<<<<<< marked', conflicted: true });

function options(overrides: Partial<ReconcileOptions> = {}): ReconcileOptions {
  return { version: '1.3.0', writeConflicts: false, mergeText: neverMerges, ...overrides };
}

/** A skill installed at 1.2.0 from V1, with the base on disk, unless a field says otherwise. */
function recorded(overrides: Partial<SkillSides>): SkillSides {
  return {
    record: { version: '1.2.0', hash: V1.hash },
    base: V1,
    local: V1,
    shipped: V1,
    ...overrides,
  };
}

describe('reconcileSkill - a skill the manifest does not know', () => {
  it('copies it when the project has no folder with its name', () => {
    const outcome = reconcileSkill(
      { record: undefined, local: undefined, base: undefined, shipped: V1 },
      options(),
    );
    expect(outcome).toEqual({ synced: true, status: 'copied', local: V1, files: [] });
  });

  it('adopts a folder that already equals what the package ships, writing nothing into it', () => {
    const outcome = reconcileSkill(
      { record: undefined, local: V1, base: undefined, shipped: V1 },
      options(),
    );
    expect(outcome).toEqual({ synced: true, status: 'adopted', files: [] });
  });

  it("leaves alone the project's own folder with a shipped skill's name", () => {
    const outcome = reconcileSkill(
      { record: undefined, local: EDITED, base: undefined, shipped: V1 },
      options(),
    );
    expect(outcome).toEqual({ synced: false, status: 'unmanaged', files: [] });
  });
});

describe('reconcileSkill - the package ships what the project already has as base', () => {
  it('is unchanged when the project did not edit it', () => {
    expect(reconcileSkill(recorded({}), options())).toEqual({
      synced: true,
      status: 'unchanged',
      files: [],
    });
  });

  it('is altered, and not written, when the project edited it', () => {
    expect(reconcileSkill(recorded({ local: EDITED }), options())).toEqual({
      synced: true,
      status: 'altered',
      files: [],
    });
  });
});

describe('reconcileSkill - the package ships a new version of the skill', () => {
  it('updates a skill the project did not edit', () => {
    expect(reconcileSkill(recorded({ shipped: V2 }), options())).toEqual({
      synced: true,
      status: 'updated',
      local: V2,
      files: [],
    });
  });

  it('merges the new version into a skill the project edited, when the merge is clean', () => {
    const outcome = reconcileSkill(
      recorded({ local: EDITED, shipped: V2 }),
      options({ mergeText: cleanMerge }),
    );
    expect(outcome.status).toBe('merged');
    expect(outcome.synced).toBe(true);
    expect(outcome.files).toEqual(['SKILL.md']);
    expect(outcome.synced && outcome.local?.file('SKILL.md')?.content.toString()).toBe(
      'v1 edited by the project + v2',
    );
  });

  it('writes nothing when the merge conflicts: the edit stays, the conflict is named', () => {
    const outcome = reconcileSkill(
      recorded({ local: EDITED, shipped: V2 }),
      options({ mergeText: conflictingMerge }),
    );
    expect(outcome).toEqual({ synced: false, status: 'conflict', files: ['SKILL.md'] });
  });

  it('writes the conflict markers only when asked to', () => {
    const outcome = reconcileSkill(
      recorded({ local: EDITED, shipped: V2 }),
      options({ mergeText: conflictingMerge, writeConflicts: true }),
    );
    expect(outcome.status).toBe('conflict-marked');
    expect(outcome.synced).toBe(true);
    expect(outcome.files).toEqual(['SKILL.md']);
    expect(outcome.synced && outcome.local?.file('SKILL.md')?.content.toString()).toBe(
      '<<<<<<< marked',
    );
  });

  it('is unchanged when the project already holds exactly the new version', () => {
    expect(reconcileSkill(recorded({ local: V2, shipped: V2 }), options())).toEqual({
      synced: true,
      status: 'unchanged',
      files: [],
    });
  });

  // Without the original there is no third side: a two-way "merge" would
  // read the project's edits as deletions to undo.
  it.each([
    ['is gone', undefined],
    ['was edited', treeOf({ 'SKILL.md': 'not the original' })],
  ])('does not merge when the stored base %s', (_, base) => {
    const outcome = reconcileSkill(recorded({ local: EDITED, shipped: V2, base }), options());
    expect(outcome).toEqual({ synced: false, status: 'base-lost', files: [] });
  });

  it('updates an unedited skill even with the base gone: the skill itself is the original', () => {
    const outcome = reconcileSkill(recorded({ shipped: V2, base: undefined }), options());
    expect(outcome.status).toBe('updated');
  });
});

describe('reconcileSkill - what the project decided stays decided', () => {
  it('does not bring back a skill the project deleted', () => {
    expect(reconcileSkill(recorded({ local: undefined, shipped: V2 }), options())).toEqual({
      synced: false,
      status: 'removed',
      files: [],
    });
  });

  // A teammate with a stale node_modules must not roll the project's skills
  // back to the version they still have installed.
  it('does not touch a skill recorded by a newer toolbox than the one running', () => {
    const outcome = reconcileSkill(
      { record: { version: '1.4.0', hash: V2.hash }, base: V2, local: V2, shipped: V1 },
      options({ version: '1.3.0' }),
    );
    expect(outcome).toEqual({ synced: false, status: 'ahead', files: [] });
  });
});
