// What `toolbox install` does with one skill (ADR-0003). Three things are
// compared: the manifest's record, the project's folder (`local`) and what
// the running package ships (`shipped`). A fourth, the original the project
// copied, is fetched from its release only when a merge needs it: the
// project does not keep a second copy of every skill.
//
// The rule the whole feature exists for: an edit the project made is never
// lost. So the only automatic write over an edited skill is a merge that
// settled every file; anything short of that leaves the folder as it is and
// says why. The outcome type carries that rule: a kept outcome has no tree
// to write, so no caller can write one by mistake.

import { mergeSkillTrees, type TextMerge } from './merge-skill-trees.mts';
import type { SkillRecord } from './skill-manifest.mts';
import type { SkillTree } from './skill-tree.mts';
import { classifySkill, type SkillState } from './skill-state.mts';

/** The skill is settled against what the package ships; the record moves to the running version. */
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
  | 'no-original' // edited skill, new version, and the original could not be fetched
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
  | {
      synced: false;
      status: KeptStatus;
      files: string[];
      /** Why, when the status alone does not say. */ reason?: string;
    };

/** The skill as a past release shipped it, or why it could not be read. */
export type OriginalLookup = { found: true; tree: SkillTree } | { found: false; reason: string };

export interface SkillSides {
  record: SkillRecord | undefined;
  /** The project's folder; undefined when there is none. */
  local: SkillTree | undefined;
  shipped: SkillTree;
  /**
   * Reads the skill as the given release shipped it. Called only when a merge
   * needs the original: it costs a download.
   */
  original: (version: string) => OriginalLookup;
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

function kept(status: KeptStatus, files: string[] = [], reason?: string): Reconciliation {
  return reason === undefined
    ? { synced: false, status, files }
    : { synced: false, status, files, reason };
}

function reconcileUnrecorded({ local, shipped }: SkillSides): Reconciliation {
  if (!local) return synced('copied', shipped);
  return local.equals(shipped) ? synced('adopted') : kept('unmanaged');
}

// The fetched release must be the one the project copied from. A tag that
// was moved, or a release packed differently, is not: merging against it
// would read as edits what the project never touched.
function recordedOriginal({ record, original }: Recorded): OriginalLookup {
  const lookup = original(record.version);
  if (!lookup.found || lookup.tree.hash === record.hash) return lookup;
  return {
    found: false,
    reason: `the ${record.version} release holds other content for this skill than the manifest recorded`,
  };
}

// Without the original there is no third side, and a two-way "merge" would
// read the project's edits as deletions to undo.
function mergeIntoEdited(sides: Recorded, options: ReconcileOptions): Reconciliation {
  const original = recordedOriginal(sides);
  if (!original.found) return kept('no-original', [], original.reason);
  const { tree, merged, conflicts } = mergeSkillTrees(
    { base: original.tree, ours: sides.local, theirs: sides.shipped },
    options.mergeText,
  );
  if (conflicts.length === 0) return synced('merged', tree, merged);
  return options.writeConflicts
    ? synced('conflict-marked', tree, conflicts)
    : kept('conflict', conflicts);
}

function reconcileRecorded(
  state: SkillState,
  sides: Recorded,
  options: ReconcileOptions,
): Reconciliation {
  if (state.upstream === 'current')
    return synced(state.local === 'intact' ? 'unchanged' : 'altered');
  return state.local === 'intact'
    ? synced('updated', sides.shipped)
    : mergeIntoEdited(sides, options);
}

/**
 * Decides what an install does with one skill. It reads the sides and returns
 * what must be written; the one effect it may cause is `sides.original`.
 *
 * @example
 *   reconcileSkill({ record, local, shipped, original }, { version: '2.0.0', writeConflicts: false, mergeText })
 *   // => { synced: true, status: 'updated', local: shipped, files: [] }
 */
export function reconcileSkill(sides: SkillSides, options: ReconcileOptions): Reconciliation {
  const { record, local } = sides;
  if (!record) return reconcileUnrecorded(sides);
  // Whether the skill is edited, behind or ahead is `classifySkill`'s to say,
  // for `toolbox skills` too; this function only maps the state to an action.
  const state = classifySkill(sides, options.version);
  if (state.upstream === 'ahead') return kept('ahead');
  if (!local) return kept('removed');
  return reconcileRecorded(state, { ...sides, record, local }, options);
}
