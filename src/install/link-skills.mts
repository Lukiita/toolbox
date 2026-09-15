// Puts the package's skills where every agent reads them: `.agents/skills/`
// in the project. A symlink per skill, so an update of the package is an
// update of the skill with no copy to drift - the same reason the toolbox
// links `~/.agents/skills` on a machine.
//
// Only the skills the package ships are touched. A project keeps its own
// skills in the same folder (project-c has twenty), and a real directory with a
// package skill's name is the project's, never replaced - it is reported so
// the owner decides.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

export interface LinkSkillsOptions {
  /** The installed package directory (where `skills/` lives). */
  packageDir: string;
  /** The project root; `.agents/skills/` is created under it. */
  projectRoot: string;
}

export interface LinkSkillsSummary {
  linked: string[];
  /** Already pointing at the package: nothing done. */
  unchanged: string[];
  /** The project's own directory or its own symlink with the same name: left alone. */
  kept: string[];
}

/**
 * Every folder under `skills/` that has a SKILL.md.
 *
 * @example
 *   shippedSkills('/p/node_modules/@lukiita/toolbox') // => ['code-review', 'retro', ...]
 */
export function shippedSkills(packageDir: string): string[] {
  const dir = join(packageDir, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

// A link the project made itself - pointing anywhere but into the package -
// is the project's pin, kept like a real directory would be. Only our own
// links (into the package) and dangling ones are replaced.
// "Ours" by the nominal package path or by its real one: under pnpm the
// package dir is a symlink into `.pnpm/<hash>/`, and a link written by an
// earlier version (or resolved by the OS) may spell either.
function isForeignLink(dest: string, packageDir: string): boolean {
  const target = resolve(realParent(dest), readlinkSync(dest));
  if (!existsSync(target)) return false;
  const ours = existsSync(packageDir) ? [packageDir, realpathSync(packageDir)] : [packageDir];
  return !ours.some((p) => target.startsWith(p));
}

// The directory the link is physically written into. When `.agents/skills`
// (or any ancestor) is itself a symlink, a relative target computed from the
// nominal path resolves from the wrong place and every link dangles (loop
// round 1) - the OS resolves the link from where it really lives.
function realParent(dest: string): string {
  return realpathSync(resolve(dest, '..'));
}

type DestState = 'absent' | 'kept' | 'unchanged' | 'replace';

function isPresent(dest: string): boolean {
  return existsSync(dest) || isSymlink(dest);
}

function destState(dest: string, packageDir: string, wanted: string): DestState {
  if (!isPresent(dest)) return 'absent';
  if (!isSymlink(dest)) return 'kept';
  if (isForeignLink(dest, packageDir)) return 'kept';
  return readlinkSync(dest) === wanted ? 'unchanged' : 'replace';
}

function linkOne(
  name: string,
  target: string,
  dest: string,
  packageDir: string,
  summary: LinkSkillsSummary,
): void {
  // The NOMINAL target (`node_modules/@lukiita/toolbox/skills/x`), never its
  // real path: under pnpm the real path pins a `.pnpm/<hash>/` that changes
  // on every update, and the link would keep serving the old version (loop
  // round 2). Relative from where the link really lives (loop round 1).
  const wanted = relative(realParent(dest), target);
  const state = destState(dest, packageDir, wanted);
  if (state === 'kept') return void summary.kept.push(name);
  if (state === 'unchanged') return void summary.unchanged.push(name);
  if (state === 'replace') unlinkSync(dest);
  // Relative, so the project can move and a container sees the same tree.
  symlinkSync(wanted, dest, 'dir');
  summary.linked.push(name);
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Links the shipped skills into the project. Idempotent.
 *
 * @example
 *   linkSkills({ packageDir: '/p/node_modules/@lukiita/toolbox', projectRoot: '/p' })
 *   // => { linked: ['code-review', ...], unchanged: [], kept: [] }
 */
export function linkSkills({ packageDir, projectRoot }: LinkSkillsOptions): LinkSkillsSummary {
  const skillsDir = join(projectRoot, '.agents', 'skills');
  mkdirSync(skillsDir, { recursive: true });
  const summary: LinkSkillsSummary = { linked: [], unchanged: [], kept: [] };
  for (const name of shippedSkills(packageDir)) {
    linkOne(name, join(packageDir, 'skills', name), join(skillsDir, name), packageDir, summary);
  }
  return summary;
}
