import type { SkillRecord } from './skill-manifest.mts';
import type { SkillTree } from './skill-tree.mts';
import { type ReleaseNumber } from './toolbox-version.mts';
/** The project's side. */
export type LocalState = 'intact' | 'altered' | 'removed' | 'not-installed' | 'unmanaged';
/** The package's side. */
export type UpstreamState = 'current' | 'behind' | 'ahead' | 'retired' | 'untracked';
export interface SkillState {
    local: LocalState;
    upstream: UpstreamState;
}
export interface SkillSnapshot {
    record: SkillRecord | undefined;
    /** The project's folder; undefined when there is none. */
    local: SkillTree | undefined;
    /** What the running package ships; undefined when it no longer ships the skill. */
    shipped: SkillTree | undefined;
}
/**
 * Where a skill stands between the manifest, the project and the running package.
 *
 * @example
 *   classifySkill({ record, local, shipped }, '2.1.0')
 *   // => { local: 'altered', upstream: 'behind' }
 */
export declare function classifySkill(snapshot: SkillSnapshot, runningVersion: ReleaseNumber): SkillState;
