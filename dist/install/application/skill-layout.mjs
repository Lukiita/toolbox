// Where the feature keeps things in a project (ADR-0003). A contract with
// every project that ran `toolbox install`, so it lives with the use cases:
// the disk adapter writes there and the report lines name it.
//
//   .agents/skills/<name>/        the project's copy of a skill - its to edit
//   .agents/toolbox-skills.json   the manifest: version + hash of each original
//
// The originals themselves are not kept in the project: a merge reads them
// from the release the manifest names (`infra/git-past-releases.mts`).
import { join } from 'node:path';
export const SKILLS_DIR = join('.agents', 'skills');
export const MANIFEST_FILE = join('.agents', 'toolbox-skills.json');
