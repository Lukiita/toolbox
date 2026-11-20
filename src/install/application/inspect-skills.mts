// `toolbox skills`: what differs between the project's skills, the manifest
// and what the running package ships (ADR-0003). ADR-0001 was written
// because copies drifted where nobody looked; this is the look.
//
// Read-only and offline on purpose: a status command that waits on the
// network gets skipped. The price is one case. With no copy of the original
// in the project, a file's changes can be told apart only while one side
// still IS the original: an edited skill is compared with the package when
// the package is unchanged, and a waiting version with the project's folder
// when that is unedited. When both moved, the files that differ are listed
// without saying whose change each is - `toolbox install` fetches the
// original and settles it.

import { join } from 'node:path';

import type { SkillManifest, SkillRecord } from '../domain/skill-manifest.aggregate.mts';
import type { SkillTree } from '../domain/skill-tree.vo.mts';
import { isOlderVersion } from '../domain/toolbox-version.mts';
import {
  readShippedSkillTree,
  readSkillTree,
  shippedSkills,
  skillLinkKind,
  type SkillLinkKind,
} from '../infra/skill-directory.mts';
import { type SkillPaths, skillPaths, type SkillRoots } from '../infra/skill-layout.mts';
import { readSkillManifest } from '../infra/skill-manifest-file.mts';

/** The project's side, against the recorded original. */
export type LocalState =
  | 'intact'
  | 'altered'
  | 'removed' // recorded, and the project deleted the folder
  | 'not-installed' // shipped, never copied here
  | 'unmanaged' // the project's own folder under a shipped skill's name
  | 'pinned' // the project's own symlink
  | 'linked'; // a symlink from the link-era install: `toolbox install` replaces it

/** The package's side, against the recorded original. */
export type UpstreamState =
  | 'current'
  | 'behind' // the package ships other content: `toolbox install` would act
  | 'ahead' // recorded by a newer toolbox than the one running
  | 'retired' // recorded, no longer shipped
  | 'untracked'; // no record to compare against

export interface SkillInspection {
  name: string;
  /** The recorded toolbox version; undefined when the manifest does not know the skill. */
  version: string | undefined;
  local: LocalState;
  upstream: UpstreamState;
  /** Files the project changed, for an edited skill the package did not move. */
  alteredFiles: string[];
  /** Files the package changed, for an unedited skill with a new version waiting. */
  behindFiles: string[];
  /** Files that differ between project and package when both moved: whose change is not known here. */
  divergedFiles: string[];
  paths: SkillPaths;
}

export interface InspectSkillsOptions extends SkillRoots {
  /** The version of the running toolbox. */
  version: string;
}

/** Diffs two files; a path that does not exist reads as an empty file. */
export type FileDiff = (from: string, to: string) => string;

interface Sides {
  record: SkillRecord | undefined;
  local: SkillTree | undefined;
  shipped: SkillTree | undefined;
}

function recordedState(local: SkillTree | undefined, record: SkillRecord): LocalState {
  if (!local) return 'removed';
  return local.hash === record.hash ? 'intact' : 'altered';
}

function localState({ record, local }: Sides, link: SkillLinkKind): LocalState {
  if (link === 'ours') return 'linked';
  if (link === 'pinned') return 'pinned';
  if (record) return recordedState(local, record);
  return local ? 'unmanaged' : 'not-installed';
}

function upstreamState({ record, shipped }: Sides, version: string): UpstreamState {
  if (!record) return 'untracked';
  if (!shipped) return 'retired';
  if (isOlderVersion(version, record.version)) return 'ahead';
  return shipped.hash === record.hash ? 'current' : 'behind';
}

interface DifferingFiles {
  alteredFiles: string[];
  behindFiles: string[];
  divergedFiles: string[];
}

// Each list is the same comparison, project against package; which list it
// goes in is which side still equals the original.
const LIST_OF = new Map<string, keyof DifferingFiles>([
  ['altered/current', 'alteredFiles'],
  ['intact/behind', 'behindFiles'],
  ['altered/behind', 'divergedFiles'],
]);

function differingFiles(sides: Sides, local: LocalState, upstream: UpstreamState): DifferingFiles {
  const lists: DifferingFiles = { alteredFiles: [], behindFiles: [], divergedFiles: [] };
  const list = LIST_OF.get(`${local}/${upstream}`);
  if (!list || !sides.local || !sides.shipped) return lists;
  return { ...lists, [list]: sides.local.differingPaths(sides.shipped) };
}

function inspectOne(
  name: string,
  manifest: SkillManifest,
  options: InspectSkillsOptions,
): SkillInspection {
  const paths = skillPaths(options, name);
  const sides: Sides = {
    record: manifest.find(name),
    local: readSkillTree(paths.local),
    shipped: readShippedSkillTree(paths.shipped),
  };
  const local = localState(sides, skillLinkKind(paths.local, options.packageDir));
  const upstream = upstreamState(sides, options.version);
  return {
    name,
    version: sides.record?.version,
    local,
    upstream,
    ...differingFiles(sides, local, upstream),
    paths,
  };
}

/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ packageDir, projectRoot: '/p', version: '2.1.0' })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'current', alteredFiles: ['SKILL.md'], ... }]
 */
export function inspectSkills(options: InspectSkillsOptions): SkillInspection[] {
  const manifest = readSkillManifest(options.projectRoot);
  const names = new Set([...shippedSkills(options.packageDir), ...manifest.names()]);
  return [...names].sort().map((name) => inspectOne(name, manifest, options));
}

/**
 * The diffs behind one inspection. An edit reads from the package (the
 * original) to the project; a waiting version, and files where both moved,
 * read from the project to the package.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export function skillDiffs(inspection: SkillInspection, diffFiles: FileDiff): string[] {
  const { local, shipped } = inspection.paths;
  const toPackage = [...inspection.behindFiles, ...inspection.divergedFiles];
  return [
    ...inspection.alteredFiles.map((file) => diffFiles(join(shipped, file), join(local, file))),
    ...toPackage.map((file) => diffFiles(join(local, file), join(shipped, file))),
  ];
}
