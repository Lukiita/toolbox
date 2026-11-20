// `toolbox install`: copies the skills the package ships into the project,
// as files the project versions and may edit (ADR-0003). Until 2.0 this
// linked them; the links hid the content from git and from a reviewer, and
// asked for Node in a repository that only wanted the markdown.
//
// This module is the plumbing: it reads the sides of each skill, asks the
// domain what to do (`reconcile-skill.mts`) and writes what it answers.
// No rule lives here.

import { rmSync } from 'node:fs';
import { join } from 'node:path';

import type { TextMerge } from '../domain/merge-skill-trees.mts';
import {
  type OriginalLookup,
  type Reconciliation,
  reconcileSkill,
  type SkillSides,
  type SkillStatus,
} from '../domain/reconcile-skill.mts';
import type { SkillManifest } from '../domain/skill-manifest.aggregate.mts';
import type { SkillTree } from '../domain/skill-tree.vo.mts';
import {
  readShippedSkillTree,
  readSkillTree,
  shippedSkills,
  skillLinkKind,
  writeSkillTree,
} from '../infra/skill-directory.mts';
import { type SkillPaths, skillPaths, type SkillRoots } from '../infra/skill-layout.mts';
import { readSkillManifest, writeSkillManifest } from '../infra/skill-manifest-file.mts';

/** A past release of the toolbox, fetched: its package folder, or why it could not be had. */
export type FetchedRelease =
  { fetched: true; packageDir: string } | { fetched: false; reason: string };

/**
 * Where the original of an edited skill is read from: the release the
 * manifest names. A port, because it leaves the machine (`git-past-releases.mts`).
 */
export interface PastReleases {
  fetch(version: string): FetchedRelease;
  /** Removes what `fetch` downloaded. */
  dispose(): void;
}

export interface InstallSkillsOptions extends SkillRoots {
  /** The version of the running toolbox, from its package.json. */
  version: string;
  /** Write a merge that left conflicts, markers included (`--write-conflicts`). */
  writeConflicts: boolean;
  mergeText: TextMerge;
  pastReleases: PastReleases;
}

export type InstallStatus =
  | SkillStatus
  | 'pinned' // the project's own symlink under a shipped skill's name: kept
  | 'retired'; // recorded, and no longer shipped by the package: kept

export interface SkillInstallReport {
  name: string;
  status: InstallStatus;
  /** The files a merge settled or could not settle. */
  files: string[];
  /** Why, when the status alone does not say (`no-original`). */
  reason?: string;
}

interface InstallContext {
  manifest: SkillManifest;
  options: InstallSkillsOptions;
}

// The skill as the release the record names shipped it.
function originalFrom(releases: PastReleases, name: string, version: string): OriginalLookup {
  const release = releases.fetch(version);
  if (!release.fetched) return { found: false, reason: release.reason };
  const tree = readShippedSkillTree(join(release.packageDir, 'skills', name));
  if (tree) return { found: true, tree };
  return { found: false, reason: `the ${version} release has no skill named ${name}` };
}

function readSides(paths: SkillPaths, name: string, context: InstallContext): SkillSides {
  return {
    record: context.manifest.find(name),
    local: readSkillTree(paths.local),
    // `shippedSkills` listed the folder, so it is there.
    shipped: readShippedSkillTree(paths.shipped) as SkillTree,
    original: (version) => originalFrom(context.options.pastReleases, name, version),
  };
}

function reportOf(name: string, outcome: Reconciliation): SkillInstallReport {
  const report: SkillInstallReport = { name, status: outcome.status, files: outcome.files };
  if (outcome.synced || outcome.reason === undefined) return report;
  return { ...report, reason: outcome.reason };
}

function installOne(name: string, context: InstallContext): SkillInstallReport {
  const { manifest, options } = context;
  const paths = skillPaths(options, name);
  const link = skillLinkKind(paths.local, options.packageDir);
  if (link === 'pinned') return { name, status: 'pinned', files: [] };
  // A link from the link-era install: the copy takes its place. Removing the
  // link never touches what it points at.
  if (link === 'ours') rmSync(paths.local);
  const sides = readSides(paths, name, context);
  const outcome = reconcileSkill(sides, options);
  if (outcome.synced) {
    if (outcome.local) writeSkillTree(paths.local, outcome.local);
    manifest.record(name, { version: options.version, hash: sides.shipped.hash });
  }
  return reportOf(name, outcome);
}

/**
 * Brings the project's `.agents/skills/` up to what the package ships,
 * without losing an edit the project made. Idempotent.
 *
 * @example
 *   installSkills({ packageDir, projectRoot: '/p', version: '2.0.0', writeConflicts: false, mergeText: gitTextMerge, pastReleases })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, ...]
 */
export function installSkills(options: InstallSkillsOptions): SkillInstallReport[] {
  try {
    const manifest = readSkillManifest(options.projectRoot);
    const shipped = shippedSkills(options.packageDir);
    const reports = shipped.map((name) => installOne(name, { manifest, options }));
    const retired = manifest.names().filter((name) => !shipped.includes(name));
    writeSkillManifest(options.projectRoot, manifest);
    return [
      ...reports,
      ...retired.map((name): SkillInstallReport => ({ name, status: 'retired', files: [] })),
    ];
  } finally {
    options.pastReleases.dispose();
  }
}
