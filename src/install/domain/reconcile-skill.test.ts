import { describe, expect, it } from 'vitest';

import { parseReleaseNumber as v } from './toolbox-version.mts';

import type { TextMerge } from './merge-skill-trees.mts';
import {
  type OriginalLookup,
  type ReconcileOptions,
  reconcileSkill,
  reconcileUnshipped,
  type SkillSides,
} from './reconcile-skill.mts';
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

/** The original costs a download: every case that settles without a merge must not ask for it. */
const neverFetched = (version: string): OriginalLookup => {
  throw new Error(`unexpected fetch of the ${version} original`);
};
const fetchedV1 = (): OriginalLookup => ({ found: true, tree: V1 });

function options(overrides: Partial<ReconcileOptions> = {}): ReconcileOptions {
  return { version: v('1.3.0'), writeConflicts: false, mergeText: neverMerges, ...overrides };
}

/** A skill installed at 1.2.0 from V1, unless a field says otherwise. */
function recorded(overrides: Partial<SkillSides>): SkillSides {
  return {
    record: { version: v('1.2.0'), hash: V1.hash },
    local: V1,
    shipped: V1,
    requested: false,
    original: neverFetched,
    ...overrides,
  };
}

function unrecorded(local: SkillSides['local'], requested = true): SkillSides {
  return { record: undefined, local, shipped: V1, requested, original: neverFetched };
}

describe('reconcileSkill - a skill the manifest does not know', () => {
  it('copies it when the project asked for it and has no folder with its name', () => {
    expect(reconcileSkill(unrecorded(undefined), options())).toEqual({
      synced: true,
      status: 'copied',
      local: V1,
      files: [],
    });
  });

  // A project picks the skills it wants: one it did not ask for is offered,
  // never copied in.
  it('leaves a skill the project did not ask for as available', () => {
    expect(reconcileSkill(unrecorded(undefined, false), options())).toEqual({
      synced: false,
      status: 'available',
      files: [],
    });
  });

  it('adopts a folder that already equals what the package ships, writing nothing into it', () => {
    expect(reconcileSkill(unrecorded(V1), options())).toEqual({
      synced: true,
      status: 'adopted',
      files: [],
    });
  });

  it("leaves alone the project's own folder with a shipped skill's name", () => {
    expect(reconcileSkill(unrecorded(EDITED), options())).toEqual({
      synced: false,
      status: 'unmanaged',
      files: [],
    });
  });
});

describe('reconcileSkill - the package ships what the manifest recorded', () => {
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
  it('updates a skill the project did not edit, without fetching anything', () => {
    expect(reconcileSkill(recorded({ shipped: V2 }), options())).toEqual({
      synced: true,
      status: 'updated',
      local: V2,
      files: [],
    });
  });

  it('is unchanged when the project already holds exactly the new version', () => {
    expect(reconcileSkill(recorded({ local: V2, shipped: V2 }), options())).toEqual({
      synced: true,
      status: 'unchanged',
      files: [],
    });
  });

  it('fetches the original of the recorded version to merge into a skill the project edited', () => {
    const asked: string[] = [];
    const original = (version: string): OriginalLookup => {
      asked.push(version);
      return { found: true, tree: V1 };
    };
    reconcileSkill(
      recorded({ local: EDITED, shipped: V2, original }),
      options({ mergeText: cleanMerge }),
    );
    expect(asked).toEqual(['1.2.0']);
  });

  it('merges the new version into the edited skill when the merge is clean', () => {
    const outcome = reconcileSkill(
      recorded({ local: EDITED, shipped: V2, original: fetchedV1 }),
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
      recorded({ local: EDITED, shipped: V2, original: fetchedV1 }),
      options({ mergeText: conflictingMerge }),
    );
    expect(outcome).toEqual({ synced: false, status: 'conflict', files: ['SKILL.md'] });
  });

  it('writes the conflict markers only when asked to', () => {
    const outcome = reconcileSkill(
      recorded({ local: EDITED, shipped: V2, original: fetchedV1 }),
      options({ mergeText: conflictingMerge, writeConflicts: true }),
    );
    expect(outcome.status).toBe('conflict-marked');
    expect(outcome.synced).toBe(true);
    expect(outcome.files).toEqual(['SKILL.md']);
    expect(outcome.synced && outcome.local?.file('SKILL.md')?.content.toString()).toBe(
      '<<<<<<< marked',
    );
  });

  // Without the original there is no third side: a two-way "merge" would
  // read the project's edits as deletions to undo.
  it('does not merge when the original cannot be had, and says why', () => {
    const outcome = reconcileSkill(
      recorded({
        local: EDITED,
        shipped: V2,
        original: () => ({ found: false, reason: 'could not reach the repository' }),
      }),
      options(),
    );
    expect(outcome).toEqual({
      synced: false,
      status: 'no-original',
      files: [],
      reason: 'could not reach the repository',
    });
  });

  // A tag that was moved, or a release packed differently: merging against
  // content the project never copied would invent edits.
  it('does not merge against a fetched release that is not what the manifest recorded', () => {
    const outcome = reconcileSkill(
      recorded({
        local: EDITED,
        shipped: V2,
        original: () => ({ found: true, tree: treeOf({ 'SKILL.md': 'not what was copied' }) }),
      }),
      options(),
    );
    expect(outcome).toEqual({
      synced: false,
      status: 'no-original',
      files: [],
      reason: 'the 1.2.0 release holds other content for this skill than the manifest recorded',
    });
  });
});

describe('reconcileSkill - what the project decided stays decided', () => {
  // Deleting the folder is how a project stops wanting a skill: the record
  // goes with it, and from then on the skill is only offered.
  it('does not bring back a skill the project deleted, and drops its record', () => {
    expect(reconcileSkill(recorded({ local: undefined, shipped: V2 }), options())).toEqual({
      synced: false,
      status: 'removed',
      files: [],
      dropsRecord: true,
    });
  });

  // `toolbox install <name>` after deleting the folder: the project wants it again.
  it('copies a deleted skill again when the project asks for it', () => {
    const outcome = reconcileSkill(
      recorded({ local: undefined, shipped: V2, requested: true }),
      options(),
    );
    expect(outcome).toEqual({ synced: true, status: 'copied', local: V2, files: [] });
  });

  // A teammate with a stale node_modules must not roll the project's skills
  // back to the version they still have installed.
  it('does not touch a skill recorded by a newer toolbox than the one running', () => {
    const outcome = reconcileSkill(
      {
        record: { version: v('1.4.0'), hash: V2.hash },
        local: V2,
        shipped: V1,
        requested: false,
        original: neverFetched,
      },
      options({ version: v('1.3.0') }),
    );
    expect(outcome).toEqual({ synced: false, status: 'ahead', files: [] });
  });
});

describe('reconcileUnshipped - a recorded skill the running package does not ship', () => {
  const record = { version: v('1.2.0'), hash: V1.hash };

  it('is retired, and kept, while the project still has its folder', () => {
    expect(reconcileUnshipped({ record, local: V1 }, v('1.3.0'))).toEqual({
      synced: false,
      status: 'retired',
      files: [],
    });
  });

  it('drops the record once the project deleted the folder: nothing is left to describe', () => {
    expect(reconcileUnshipped({ record, local: undefined }, v('1.3.0'))).toEqual({
      synced: false,
      status: 'removed',
      files: [],
      dropsRecord: true,
    });
  });

  // The skill was added by a newer toolbox than the one running.
  it('is ahead, and untouched, when a newer toolbox recorded it', () => {
    const newer = { version: v('1.4.0'), hash: V2.hash };
    expect(reconcileUnshipped({ record: newer, local: V2 }, v('1.3.0'))).toEqual({
      synced: false,
      status: 'ahead',
      files: [],
    });
    expect(reconcileUnshipped({ record: newer, local: undefined }, v('1.3.0'))).toEqual({
      synced: false,
      status: 'ahead',
      files: [],
    });
  });
});
