// Where the installer reads and writes, in one place (ADR-0003).
//
//   <package>/skills/<name>/                 what the running toolbox ships
//   .agents/skills/<name>/                   the project's copy - its to edit
//   .agents/toolbox/base/<name>/             the original of that copy, unedited
//   .agents/toolbox/skills-manifest.json     version + hash of each original
//
// The base lives outside `.agents/skills/` so no agent lists it as a skill.
import { join } from 'node:path';
export const SKILLS_DIR = join('.agents', 'skills');
export const BASE_DIR = join('.agents', 'toolbox', 'base');
export const MANIFEST_FILE = join('.agents', 'toolbox', 'skills-manifest.json');
/**
 * The three folders of one skill.
 *
 * @example
 *   skillPaths({ packageDir, projectRoot: '/p' }, 'retro').local // => '/p/.agents/skills/retro'
 */
export function skillPaths({ packageDir, projectRoot }, name) {
    return {
        local: join(projectRoot, SKILLS_DIR, name),
        base: join(projectRoot, BASE_DIR, name),
        shipped: join(packageDir, 'skills', name),
    };
}
