// What `toolbox install` does with one skill (ADR-0003). Four things are
// compared: the manifest's record, the project's folder (`local`), the
// stored original (`base`) and what the running package ships (`shipped`).
//
// The rule the whole feature exists for: an edit the project made is never
// lost. So the only automatic write over an edited skill is a merge that
// settled every file; anything short of that leaves the folder as it is and
// says why. The outcome type carries that rule: a kept outcome has no tree
// to write, so no caller can write one by mistake.

import { mergeSkillTrees, type TextMerge } from './merge-skill-trees.mts';
import type { SkillRecord } from './skill-manifest.aggregate.mts';
import type { SkillTree } from './skill-tree.vo.mts';
import { isOlderVersion } from './toolbox-version.mts';

/** The base now equals what the package ships; the record moves to the running version. */
export type SyncedStatus =
  | 'copied' // first install
  | 'adopted' // the project's folder already equalled the package's: recorded, not written
  | 'updated' // intact skill, new version: replaced
  | 'merged' // edited skill, new version: every file settled
  | 'conflict-marked' // edited skill, new version: written with markers, on request
  | 'unchanged'
  | 'altered'; // edited skill, nothing new upstream: kept

/** Nothing is written and the record stays where it was. */
export type KeptStatus =
  | 'unmanaged' // the project's own folder under a shipped skill's name
  | 'removed' // the project deleted the skill: not brought back
  | 'conflict' // edited skill, new version, at least one file unsettled
  | 'base-lost' // edited skill, new version, and no sound original to merge against
  | 'ahead'; // recorded by a newer toolbox than the one running

export type SkillStatus = SyncedStatus | KeptStatus;

export type Reconciliation =
  | {
      synced: true;
      status: SyncedStatus;
      /** What the project's folder must become; absent = the folder is not written. */
      local?: SkillTree;
      /** The files a merge settled, or marked. */
      files: string[];
    }
  | { synced: false; status: KeptStatus; files: string[] };

export interface SkillSides {
  record: SkillRecord | undefined;
  /** The project's folder; undefined when there is none. */
  local: SkillTree | undefined;
  /** The stored original; undefined when there is none. */
  base: SkillTree | undefined;
  shipped: SkillTree;
}

export interface ReconcileOptions {
  /** The version of the running toolbox. */
  version: string;
  /** Write a merge that left conflicts, markers included. */
  writeConflicts: boolean;
  mergeText: TextMerge;
}

type Recorded = SkillSides & { record: SkillRecord; local: SkillTree };

function synced(status: SyncedStatus, local?: SkillTree, files: string[] = []): Reconciliation {
  return local ? { synced: true, status, local, files } : { synced: true, status, files };
}

function kept(status: KeptStatus, files: string[] = []): Reconciliation {
  return { synced: false, status, files };
}

function reconcileUnrecorded({ local, shipped }: SkillSides): Reconciliation {
  if (!local) return synced('copied', shipped);
  return local.equals(shipped) ? synced('adopted') : kept('unmanaged');
}

// Without the original there is no third side, and a two-way "merge" would
// read the project's edits as deletions to undo.
function mergeIntoEdited(sides: Recorded, options: ReconcileOptions): Reconciliation {
  const { base, local, shipped, record } = sides;
  if (base?.hash !== record.hash) return kept('base-lost');
  const { tree, merged, conflicts } = mergeSkillTrees(
    { base, ours: local, theirs: shipped },
    options.mergeText,
  );
  if (conflicts.length === 0) return synced('merged', tree, merged);
  return options.writeConflicts
    ? synced('conflict-marked', tree, conflicts)
    : kept('conflict', conflicts);
}

function reconcileRecorded(sides: Recorded, options: ReconcileOptions): Reconciliation {
  const { record, local, shipped } = sides;
  // Equal to the package: a plain re-run, the new version applied by hand, or
  // an install that died after writing the folder and before saving the manifest.
  if (local.equals(shipped)) return synced('unchanged');
  if (shipped.hash === record.hash) return synced('altered');
  return local.hash === record.hash ? synced('updated', shipped) : mergeIntoEdited(sides, options);
}

/**
 * Decides what an install does with one skill. Pure: it reads the four sides
 * and returns what must be written.
 *
 * @example
 *   reconcileSkill({ record, local, base, shipped }, { version: '2.0.0', writeConflicts: false, mergeText })
 *   // => { synced: true, status: 'updated', local: shipped, files: [] }
 */
export function reconcileSkill(sides: SkillSides, options: ReconcileOptions): Reconciliation {
  const { record, local } = sides;
  if (!record) return reconcileUnrecorded(sides);
  if (isOlderVersion(options.version, record.version)) return kept('ahead');
  if (!local) return kept('removed');
  return reconcileRecorded({ ...sides, record, local }, options);
}
