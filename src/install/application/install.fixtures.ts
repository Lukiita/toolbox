// A scratch project with an installed package, for the installer's tests:
// real folders, real files and git's real merge - the installer is file
// plumbing around a decision, and a faked disk would test the fake.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { gitTextMerge } from '../infra/git-text-merge.mts';
import { installSkills, type SkillInstallReport } from './install-skills.mts';

/** Three paragraphs far enough apart for git to merge edits of two of them. */
export const SKILL_V1 = ['# Skill', '', 'first rule', '', 'middle', '', 'last rule', ''].join('\n');

export interface ScratchProject {
  projectRoot: string;
  packageDir: string;
  /** Path inside `.agents/skills/`. */
  local: (path: string) => string;
  /** Path inside `.agents/toolbox/base/`. */
  base: (path: string) => string;
  /** (Re)writes what the package ships for one skill, replacing the folder. */
  ship: (name: string, files: Record<string, string>) => void;
  install: (version?: string, writeConflicts?: boolean) => SkillInstallReport[];
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
    ship,
    local: (path) => join(projectRoot, '.agents', 'skills', path),
    base: (path) => join(projectRoot, '.agents', 'toolbox', 'base', path),
    install: (version = '1.2.0', writeConflicts = false) =>
      installSkills({ packageDir, projectRoot, version, writeConflicts, mergeText: gitTextMerge }),
    records: () =>
      JSON.parse(
        readFileSync(join(projectRoot, '.agents', 'toolbox', 'skills-manifest.json'), 'utf8'),
      ).skills,
  };
}

/** `{ 'code-review': 'copied', retro: 'copied' }` - the reports by name. */
export function statuses(reports: SkillInstallReport[]): Record<string, string> {
  return Object.fromEntries(reports.map((report) => [report.name, report.status]));
}
