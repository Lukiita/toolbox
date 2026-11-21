import { type SkillTree } from './skill-tree.mts';
/**
 * How a skill reaches a sibling: `<skill-dir>/../<name>/…`. One definition,
 * shared with the test that keeps every shipped reference alive.
 */
export declare const SIBLING_REFERENCE: RegExp;
export interface SkillDescription {
    /** The first sentence of the skill's description; empty when it has none. */
    summary: string;
    /** The sibling skills its files reach, sorted. */
    needs: string[];
}
/**
 * The catalog entry of a shipped skill.
 *
 * @example
 *   describeSkill(shipped)
 *   // => { summary: 'Reviews the branch diff against its base.', needs: ['sql-quality'] }
 */
export declare function describeSkill(tree: SkillTree): SkillDescription;
