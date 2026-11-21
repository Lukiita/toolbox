// Where the feature keeps things in a project (ADR-0003). A contract with
// every project that ran `toolbox install`, kept in `application/` because
// every layer around it names these places: the disk adapter reads and
// writes there, the status command labels its diffs with them, the report
// lines print them.
//
//   .agents/skills/<name>/        the project's copy of a skill - its to edit
//   .agents/toolbox-skills.json   the manifest: version + hash of each original
//
// The originals themselves are not kept in the project: a merge reads them
// from the release the manifest names (`infra/git-past-releases.mts`).

import { join } from 'node:path';

/** The folder of the package that holds the skills it ships: `<package>/skills/<name>/`. */
export const PACKAGE_SKILLS_DIR = 'skills';
export const SKILLS_DIR = join('.agents', 'skills');
export const MANIFEST_FILE = join('.agents', 'toolbox-skills.json');
