// A scratch project with an installed package, for the installer's tests:
// real folders, real files and git's real merge - the installer is file
// plumbing around a decision, and a faked disk would test the fake. So the
// fixture wires the real disk adapter, as the CLI does. The one thing faked
// is the network: past releases are folders kept here.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { OriginalLookup } from '../domain/reconcile-skill.mts';
import { DiskSkillFolders } from '../infra/disk-skill-folders.mts';
import { gitTextMerge } from '../infra/git-text-merge.mts';
import { readShippedSkillTree } from '../infra/skill-directory.mts';
import {
  hasInstalledSkills,
  installSkills,
  type SkillInstallReport,
  type SkillSelection,
} from './install-skills.mts';
import type { PastReleases } from './ports.mts';

/** Three paragraphs far enough apart for git to merge edits of two of them. */
export const SKILL_V1 = ['# Skill', '', 'first rule', '', 'middle', '', 'last rule', ''].join('\n');

/** Past releases as folders: each `install(version)` is "tagged" by keeping what it shipped. */
export class FolderPastReleases implements PastReleases {
  /** The versions asked for, one entry per skill read. */
  public readonly asked: string[] = [];
  public disposals = 0;
  private readonly root: string;

  public constructor(root: string) {
    this.root = root;
  }

  /** Keeps the package as that version shipped it, unless it is already kept. */
  public tag(version: string, packageDir: string): void {
    const dir = join(this.root, version);
    if (existsSync(dir)) return;
    cpSync(join(packageDir, 'skills'), join(dir, 'skills'), { recursive: true });
  }

  /** The release can no longer be fetched: a deleted tag, or no network. */
  public lose(version: string): void {
    rmSync(join(this.root, version), { recursive: true, force: true });
  }

  public skill(version: string, name: string): OriginalLookup {
    this.asked.push(version);
    const release = join(this.root, version);
    if (!existsSync(release)) {
      return { found: false, reason: `could not fetch v${version}: no network` };
    }
    const tree = readShippedSkillTree(join(release, 'skills', name));
    if (tree) return { found: true, tree };
    return { found: false, reason: `the ${version} release has no skill named ${name}` };
  }

  public dispose(): void {
    this.disposals += 1;
  }
}

export interface InstallChoices {
  writeConflicts?: boolean;
  /** Default: every skill on a project with none yet, nothing new afterwards - a plain `toolbox install`. */
  select?: SkillSelection;
}

export interface ScratchProject {
  projectRoot: string;
  packageDir: string;
  folders: DiskSkillFolders;
  releases: FolderPastReleases;
  /** Path inside `.agents/skills/`. */
  local: (path: string) => string;
  /** (Re)writes what the package ships for one skill, replacing the folder. */
  ship: (name: string, files: Record<string, string>) => void;
  install: (version?: string, choices?: InstallChoices) => SkillInstallReport[];
  /** Every report `onReport` was handed, in order, across the installs of this project. */
  reported: SkillInstallReport[];
  /** The `skills` object of the manifest on disk. */
  records: () => Record<string, { version: string; hash: string }>;
}

export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/**
 * A project under `root` whose package ships `code-review` (two files) and
 * `retro` (one).
 *
 * @example
 *   const scratch = scratchDirs('toolbox-install-');
 *   const project = scratchProject(scratch());
 */
export function scratchProject(root: string): ScratchProject {
  const projectRoot = join(root, 'project');
  const packageDir = join(projectRoot, 'node_modules', '@lukiita', 'toolbox');
  const folders = new DiskSkillFolders({ packageDir, projectRoot });
  const releases = new FolderPastReleases(join(root, 'releases'));
  const reported: SkillInstallReport[] = [];
  const ship = (name: string, files: Record<string, string>): void => {
    rmSync(join(packageDir, 'skills', name), { recursive: true, force: true });
    writeFiles(join(packageDir, 'skills', name), files);
  };
  ship('code-review', { 'SKILL.md': SKILL_V1, 'references/smells.md': 'smells v1\n' });
  ship('retro', { 'SKILL.md': 'hello\n' });
  mkdirSync(join(projectRoot, '.agents'), { recursive: true });
  return {
    projectRoot,
    packageDir,
    folders,
    releases,
    reported,
    ship,
    local: (path) => join(projectRoot, '.agents', 'skills', path),
    install: (version = '1.2.0', choices = {}) => {
      releases.tag(version, packageDir);
      return installSkills({
        folders,
        version,
        writeConflicts: choices.writeConflicts ?? false,
        select: choices.select ?? { names: [], all: !hasInstalledSkills(folders) },
        mergeText: gitTextMerge,
        pastReleases: releases,
        onReport: (report) => reported.push(report),
      });
    },
    records: () =>
      JSON.parse(readFileSync(join(projectRoot, '.agents', 'toolbox-skills.json'), 'utf8')).skills,
  };
}

/** `{ 'code-review': 'copied', retro: 'copied' }` - the reports by name. */
export function statuses(reports: SkillInstallReport[]): Record<string, string> {
  return Object.fromEntries(reports.map((report) => [report.name, report.status]));
}
