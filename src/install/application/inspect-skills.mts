// `toolbox skills`: what differs between the project's skills, their
// originals and what the running package ships (ADR-0003). ADR-0001 was
// written because copies drifted where nobody looked; this is the look.
// Read-only: it never writes.

import { join } from 'node:path';

import type { SkillManifest, SkillRecord } from '../domain/skill-manifest.aggregate.mts';
import type { SkillTree } from '../domain/skill-tree.vo.mts';
import { isOlderVersion } from '../domain/toolbox-version.mts';
import {
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
  /** Files that differ between the original and the project's folder. */
  alteredFiles: string[];
  /** Files that differ between the original and what the package ships. */
  behindFiles: string[];
  /** The stored original is gone or was edited: a merge is not possible until it is restored. */
  baseLost: boolean;
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
  base: SkillTree | undefined;
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

// The files are named against the original. Without a sound one there is
// nothing to name them against, and a guess would blame the wrong side.
function differing(original: SkillTree | undefined, other: SkillTree | undefined): string[] {
  return original && other ? original.differingPaths(other) : [];
}

// The stored original, when it still is the one the manifest recorded.
function soundBase({ record, base }: Sides): SkillTree | undefined {
  return base?.hash === record?.hash ? base : undefined;
}

function readSides(paths: SkillPaths, record: SkillRecord | undefined): Sides {
  return {
    record,
    local: readSkillTree(paths.local),
    base: readSkillTree(paths.base),
    shipped: readSkillTree(paths.shipped),
  };
}

function inspectOne(
  name: string,
  manifest: SkillManifest,
  options: InspectSkillsOptions,
): SkillInspection {
  const paths = skillPaths(options, name);
  const sides = readSides(paths, manifest.find(name));
  const local = localState(sides, skillLinkKind(paths.local, options.packageDir));
  const upstream = upstreamState(sides, options.version);
  const original = soundBase(sides);
  return {
    name,
    version: sides.record?.version,
    local,
    upstream,
    alteredFiles: local === 'altered' ? differing(original, sides.local) : [],
    behindFiles: upstream === 'behind' ? differing(original, sides.shipped) : [],
    baseLost: sides.record !== undefined && original === undefined,
    paths,
  };
}

/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ packageDir, projectRoot: '/p', version: '2.1.0' })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'behind', alteredFiles: ['SKILL.md'], ... }]
 */
export function inspectSkills(options: InspectSkillsOptions): SkillInspection[] {
  const manifest = readSkillManifest(options.projectRoot);
  const names = new Set([...shippedSkills(options.packageDir), ...manifest.names()]);
  return [...names].sort().map((name) => inspectOne(name, manifest, options));
}

/**
 * The diffs behind one inspection: what the project changed, then what the
 * package changed, each against the original.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export function skillDiffs(inspection: SkillInspection, diffFiles: FileDiff): string[] {
  const { base, local, shipped } = inspection.paths;
  return [
    ...inspection.alteredFiles.map((file) => diffFiles(join(base, file), join(local, file))),
    ...inspection.behindFiles.map((file) => diffFiles(join(base, file), join(shipped, file))),
  ];
}
