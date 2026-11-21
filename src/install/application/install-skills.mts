// `toolbox install`: copies the skills a project picked into the project, as
// files it versions and may edit (ADR-0003). Until 2.0 this linked every
// skill; the links hid the content from git and from a reviewer, and asked
// for Node in a repository that only wanted the markdown.
//
// This module is the plumbing: it works out which skills the project asked
// for, reads the sides of each, asks the domain what to do
// (`reconcile-skill.mts`) and writes what it answers. No rule lives here.

import type { TextMerge } from '../domain/merge-skill-trees.mts';
import {
  type Reconciliation,
  reconcileSkill,
  reconcileUnshipped,
  type SkillSides,
  type SkillStatus,
} from '../domain/reconcile-skill.mts';
import { describeSkill } from '../domain/skill-catalog.mts';
import type { SkillManifest, SkillRecord } from '../domain/skill-manifest.mts';
import type { SkillTree } from '../domain/skill-tree.mts';
import type { ReleaseNumber } from '../domain/toolbox-version.mts';
import type { PastReleases, SkillFolders } from './ports.mts';
import type { SkillSelection } from './skill-selection.mts';
import { SkillCommandUsageError } from './usage-error.mts';

export interface InstallSkillsOptions {
  folders: SkillFolders;
  pastReleases: PastReleases;
  mergeText: TextMerge;
  /** The version of the running toolbox, from its package.json. */
  version: ReleaseNumber;
  /** Write a merge that left conflicts, markers included where the text can carry them. */
  writeConflicts: boolean;
  select: SkillSelection;
  /**
   * Told about each skill as soon as it is settled. The CLI prints from here,
   * so a run that fails on a later skill has already said what it did.
   */
  onReport?: (report: SkillInstallReport) => void;
}

export type InstallStatus =
  | SkillStatus
  | 'pinned' // the project's own symlink under a shipped skill's name: kept
  | 'failed'; // this skill could not be settled; the others still were

export interface SkillInstallReport {
  name: string;
  status: InstallStatus;
  /** The files a merge settled or could not settle. */
  files: string[];
  /** What the status alone does not say: why a skill came along, was kept, or failed. */
  reason?: string;
}

interface InstallRun {
  manifest: SkillManifest;
  options: InstallSkillsOptions;
  /** Each skill asked for, with the skill that needs it when it was not named by the project. */
  requested: Map<string, string | undefined>;
}

function assertShipped(names: readonly string[], shipped: readonly string[]): void {
  const unknown = names.find((name) => !shipped.includes(name));
  if (unknown === undefined) return;
  throw new SkillCommandUsageError(
    `unknown skill: received ${JSON.stringify(unknown)}, expected one of ${shipped.join(', ')}`,
  );
}

// A skill about to be added brings the siblings its files reach, or it would
// arrive with a dead path in it. Only on the way in: a skill the project
// already has does not bring back a sibling the project deleted.
function siblingsToBringAlong(
  name: string,
  manifest: SkillManifest,
  folders: SkillFolders,
): string[] {
  if (manifest.find(name)) return [];
  try {
    const shipped = folders.readShipped(name);
    return shipped ? describeSkill(shipped).needs : [];
  } catch {
    // An unreadable skill is reported as failed when its own turn comes.
    return [];
  }
}

function requestedSkills(
  manifest: SkillManifest,
  { folders, select }: InstallSkillsOptions,
  shipped: string[],
): Map<string, string | undefined> {
  const asked = select.all ? shipped : select.names;
  const requested = new Map(asked.map((name): [string, string | undefined] => [name, undefined]));
  const pending = [...asked];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const by = name;
    const added = siblingsToBringAlong(by, manifest, folders).filter(
      (sibling) => shipped.includes(sibling) && !requested.has(sibling),
    );
    added.forEach((sibling) => requested.set(sibling, by));
    pending.push(...added);
  }
  return requested;
}

// A link the 1.x install wrote stands for the skill it pointed at: the
// project had it, so the copy takes its place whatever the manifest says.
// Decided from a record that described no folder, this skill came out
// "deleted by the project" and was never copied (found in review).
//
// The link is not removed here: the write swaps it out once the copy is
// complete. Removed first, a copy that then failed left the project with
// neither, and the next run read the skill as deleted (found in review).
function linkedSides(name: string, run: InstallRun): SkillSides {
  return { ...readSides(name, undefined, run), local: undefined, requested: true };
}

function readSides(name: string, record: SkillRecord | undefined, run: InstallRun): SkillSides {
  const { folders, pastReleases } = run.options;
  return {
    record,
    local: folders.readLocal(name),
    // `folders.shipped()` listed the skill, so it is there.
    shipped: folders.readShipped(name) as SkillTree,
    requested: run.requested.has(name),
    original: (version) => pastReleases.skill(version, name),
  };
}

// Writes what the domain decided for a shipped skill and moves its record;
// returns an old folder that could not be deleted, if any.
function write(
  name: string,
  outcome: Reconciliation,
  shipped: SkillTree,
  { manifest, options }: InstallRun,
): string | undefined {
  if (!outcome.synced) return undefined;
  const leftover = outcome.local ? options.folders.writeLocal(name, outcome.local) : undefined;
  manifest.record(name, { version: options.version, hash: shipped.hash });
  return leftover;
}

function dropRecord(name: string, outcome: Reconciliation, manifest: SkillManifest): void {
  if (!outcome.synced && outcome.dropsRecord) manifest.forget(name);
}

function reasonsOf(
  name: string,
  outcome: Reconciliation,
  leftover: string | undefined,
  run: InstallRun,
): string[] {
  const neededBy = run.requested.get(name);
  return [
    outcome.synced ? undefined : outcome.reason,
    outcome.status === 'copied' && neededBy ? `needed by ${neededBy}` : undefined,
    leftover ? `the old folder could not be deleted; remove ${leftover} by hand` : undefined,
  ].filter((reason): reason is string => reason !== undefined);
}

function reportOf(
  name: string,
  outcome: Reconciliation,
  leftover: string | undefined,
  run: InstallRun,
): SkillInstallReport {
  dropRecord(name, outcome, run.manifest);
  const report: SkillInstallReport = { name, status: outcome.status, files: outcome.files };
  const reasons = reasonsOf(name, outcome, leftover, run);
  return reasons.length === 0 ? report : { ...report, reason: reasons.join('; ') };
}

function installShipped(name: string, run: InstallRun): SkillInstallReport {
  const { folders } = run.options;
  // First of all, and for every skill: a write that died may have left this
  // skill's folder, or its 1.x link, beside its place. Only once that is
  // undone can what sits there be judged - asked before, a link put back
  // afterwards went on to be read as a folder (found in review).
  folders.recover(name);
  const link = folders.linkKind(name);
  if (link === 'pinned') return { name, status: 'pinned', files: [] };
  const sides =
    link === 'ours' ? linkedSides(name, run) : readSides(name, run.manifest.find(name), run);
  const outcome = reconcileSkill(sides, run.options);
  return reportOf(name, outcome, write(name, outcome, sides.shipped, run), run);
}

// Recorded, and not in the running package: never a write.
function installUnshipped(name: string, run: InstallRun): SkillInstallReport {
  const record = run.manifest.find(name) as SkillRecord;
  const local = run.options.folders.readLocal(name);
  return reportOf(name, reconcileUnshipped({ record, local }, run.options.version), undefined, run);
}

// One skill that cannot be settled (an unreadable file, a path the tree
// refuses) is reported and the others go on: thrown, it left every skill
// after it in the alphabet untouched, with no line saying so (found in review).
function settled(
  name: string,
  install: () => SkillInstallReport,
  run: InstallRun,
): SkillInstallReport {
  let report: SkillInstallReport;
  try {
    report = install();
  } catch (e) {
    report = {
      name,
      status: 'failed',
      files: [],
      reason: e instanceof Error ? e.message : String(e),
    };
  }
  run.options.onReport?.(report);
  return report;
}

function installAll(manifest: SkillManifest, options: InstallSkillsOptions): SkillInstallReport[] {
  const shipped = options.folders.shipped();
  assertShipped(options.select.names, shipped);
  const run: InstallRun = {
    manifest,
    options,
    requested: requestedSkills(manifest, options, shipped),
  };
  const reports = shipped.map((name) => settled(name, () => installShipped(name, run), run));
  const unshipped = manifest.names().filter((name) => !shipped.includes(name));
  return [
    ...reports,
    ...unshipped.map((name) => settled(name, () => installUnshipped(name, run), run)),
  ];
}

/**
 * Brings the skills the project picked up to what the package ships, without
 * losing an edit the project made. Skills already recorded are always
 * settled; `select` adds to them. Idempotent.
 *
 * @example
 *   installSkills({ folders, pastReleases, mergeText: gitTextMerge, version: parseReleaseNumber('2.0.0'), writeConflicts: false, select: { names: ['code-review'], all: false } })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, { name: 'sql-quality', status: 'copied', files: [], reason: 'needed by code-review' }, ...]
 */
export function installSkills(options: InstallSkillsOptions): SkillInstallReport[] {
  try {
    const manifest = options.folders.readManifest();
    try {
      return installAll(manifest, options);
    } finally {
      // Also when the run stops early: the skills already written keep their
      // records. Saved only at the end of a clean run, a failure left folders
      // at the new version under records of the old one (found in review).
      options.folders.saveManifest(manifest);
    }
  } finally {
    options.pastReleases.dispose();
  }
}
