export declare const SKILLS_DIR: string;
export declare const MANIFEST_FILE: string;
export interface SkillPaths {
    local: string;
    shipped: string;
}
export interface SkillRoots {
    /** The running package (where `skills/` lives). */
    packageDir: string;
    projectRoot: string;
}
/**
 * The two folders of one skill.
 *
 * @example
 *   skillPaths({ packageDir, projectRoot: '/p' }, 'retro').local // => '/p/.agents/skills/retro'
 */
export declare function skillPaths({ packageDir, projectRoot }: SkillRoots, name: string): SkillPaths;
