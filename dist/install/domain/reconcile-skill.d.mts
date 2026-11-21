import { type TextMerge } from './merge-skill-trees.mts';
import type { SkillRecord } from './skill-manifest.mts';
import type { SkillTree } from './skill-tree.mts';
/** The skill is settled against what the package ships; the record moves to the running version. */
export type SyncedStatus = 'copied' | 'adopted' | 'updated' | 'merged' | 'conflict-marked' | 'unchanged' | 'altered';
/** Nothing is written and the record stays where it was. */
export type KeptStatus = 'available' | 'unmanaged' | 'removed' | 'retired' | 'conflict' | 'no-original' | 'ahead';
export type SkillStatus = SyncedStatus | KeptStatus;
export type Reconciliation = {
    synced: true;
    status: SyncedStatus;
    /** What the project's folder must become; absent = the folder is not written. */
    local?: SkillTree;
    /** The files a merge settled, or marked. */
    files: string[];
} | {
    synced: false;
    status: KeptStatus;
    files: string[];
    /** Why, when the status alone does not say. */
    reason?: string;
    /** The record no longer describes anything in the project: it leaves the manifest. */
    dropsRecord?: true;
};
/** The skill as a past release shipped it, or why it could not be read. */
export type OriginalLookup = {
    found: true;
    tree: SkillTree;
} | {
    found: false;
    reason: string;
};
export interface SkillSides {
    record: SkillRecord | undefined;
    /** The project's folder; undefined when there is none. */
    local: SkillTree | undefined;
    shipped: SkillTree;
    /**
     * Whether the project asked for this skill. A project installs the skills
     * it picks, not all of them: an unrecorded skill is copied only when asked for.
     */
    requested: boolean;
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
/**
 * Decides what an install does with one skill. It reads the sides and returns
 * what must be written; the one effect it may cause is `sides.original`.
 *
 * @example
 *   reconcileSkill({ record, local, shipped, original }, { version: '2.0.0', writeConflicts: false, mergeText })
 *   // => { synced: true, status: 'updated', local: shipped, files: [] }
 */
export declare function reconcileSkill(sides: SkillSides, options: ReconcileOptions): Reconciliation;
/**
 * Decides what an install does with a recorded skill the running package does
 * not ship. Never a write: the folder is the project's to keep or delete.
 *
 * @example
 *   reconcileUnshipped({ record, local }, '2.1.0') // => { synced: false, status: 'retired', files: [] }
 */
export declare function reconcileUnshipped(recorded: {
    record: SkillRecord;
    local: SkillTree | undefined;
}, runningVersion: string): Reconciliation;
