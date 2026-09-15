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
    /** The project's own directory or its own symlink with the same name: left alone. */
    kept: string[];
}
/**
 * Every folder under `skills/` that has a SKILL.md.
 *
 * @example
 *   shippedSkills('/p/node_modules/@lukiita/toolbox') // => ['code-review', 'retro', ...]
 */
export declare function shippedSkills(packageDir: string): string[];
/**
 * Links the shipped skills into the project. Idempotent.
 *
 * @example
 *   linkSkills({ packageDir: '/p/node_modules/@lukiita/toolbox', projectRoot: '/p' })
 *   // => { linked: ['code-review', ...], unchanged: [], kept: [] }
 */
export declare function linkSkills({ packageDir, projectRoot }: LinkSkillsOptions): LinkSkillsSummary;
