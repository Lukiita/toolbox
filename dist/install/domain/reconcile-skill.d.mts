import { type TextMerge } from './merge-skill-trees.mts';
import type { SkillRecord } from './skill-manifest.aggregate.mts';
import type { SkillTree } from './skill-tree.vo.mts';
/** The base now equals what the package ships; the record moves to the running version. */
export type SyncedStatus = 'copied' | 'adopted' | 'updated' | 'merged' | 'conflict-marked' | 'unchanged' | 'altered';
/** Nothing is written and the record stays where it was. */
export type KeptStatus = 'unmanaged' | 'removed' | 'conflict' | 'base-lost' | 'ahead';
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
};
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
/**
 * Decides what an install does with one skill. Pure: it reads the four sides
 * and returns what must be written.
 *
 * @example
 *   reconcileSkill({ record, local, base, shipped }, { version: '2.0.0', writeConflicts: false, mergeText })
 *   // => { synced: true, status: 'updated', local: shipped, files: [] }
 */
export declare function reconcileSkill(sides: SkillSides, options: ReconcileOptions): Reconciliation;
