export interface LinkSkillsOptions {
    /** The installed package directory (where `skills/` lives). */
    packageDir: string;
    /** The project root; `.agents/skills/` is created under it. */
    projectRoot: string;
}
export interface LinkSkillsSummary {
    linked: string[];
    /** Already pointing at the package: nothing done. */
    unchanged: string[];
    /** A real directory of the project's own with the same name: left alone. */
    kept: string[];
}
/** Every folder under `skills/` that has a SKILL.md. */
export declare function shippedSkills(packageDir: string): string[];
/**
 * Links the shipped skills into the project. Idempotent.
 *
 * @example
 *   linkSkills({ packageDir: '/p/node_modules/@lukiita/toolbox', projectRoot: '/p' })
 *   // => { linked: ['code-review', ...], unchanged: [], kept: [] }
 */
export declare function linkSkills({ packageDir, projectRoot }: LinkSkillsOptions): LinkSkillsSummary;
