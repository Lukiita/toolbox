// Where the installer reads and writes, in one place (ADR-0003).
//
//   <package>/skills/<name>/      what the running toolbox ships
//   .agents/skills/<name>/        the project's copy - its to edit
//   .agents/toolbox-skills.json   the manifest: version + hash of each original
//
// The originals themselves are not kept in the project: a merge reads them
// from the release the manifest names (`git-past-releases.mts`).

import { join } from 'node:path';

export const SKILLS_DIR = join('.agents', 'skills');
export const MANIFEST_FILE = join('.agents', 'toolbox-skills.json');

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
export function skillPaths({ packageDir, projectRoot }: SkillRoots, name: string): SkillPaths {
  return {
    local: join(projectRoot, SKILLS_DIR, name),
    shipped: join(packageDir, 'skills', name),
  };
}
