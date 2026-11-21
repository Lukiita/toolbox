// The disk side of the installer: a skill's folder read into a `SkillTree`
// and written back from one, and the one question about symlinks the
// migration from the link-era install needs answered (ADR-0003).

import {
  chmodSync,
  type Dirent,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { type SkillFile, SkillTree } from '../domain/skill-tree.mts';

/**
 * Every folder under the package's `skills/` that has a SKILL.md.
 *
 * @example
 *   shippedSkills('/p/node_modules/@lukiita/toolbox') // => ['code-review', 'retro', ...]
 */
export function shippedSkills(packageDir: string): string[] {
  const dir = join(packageDir, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

// What running a skill's Python script (or opening the folder on macOS)
// leaves in the project's copy. Counted, every skill with a script would
// read as edited by the project the first time the script ran.
const LEFTOVER = /(^|\/)__pycache__\/|\.pyc$|(^|\/)\.DS_Store$/;

// What package.json's `files` keeps out of the package (`!skills/**/test_*.py`).
// A release fetched by git still has them, and so does a checkout of this
// repo: left in, the same skill would hash differently depending on where it
// was read from, and a fetched original would never match its record. A test
// holds this list to package.json's.
const NOT_PACKAGED = /(^|\/)test_[^/]*\.py$/;

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function readSkillFile(path: string): SkillFile {
  return { content: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

function treeEntry(dir: string, entry: Dirent): [string, SkillFile] {
  const path = join(entry.parentPath, entry.name);
  return [relative(dir, path).split(sep).join('/'), readSkillFile(path)];
}

// Regular files only. A symbolic link inside a skill is not read, so it is in
// no hash and does not survive a write of the folder - a known limit, stated
// in ADR-0003: no shipped skill has one, and modelling links (what a merge of
// two link targets means) was not worth it for a case nobody has.
function readTree(dir: string, leftOut: readonly RegExp[]): SkillTree | undefined {
  if (!isDirectory(dir)) return undefined;
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => treeEntry(dir, entry))
    .filter(([path]) => !leftOut.some((pattern) => pattern.test(path)));
  return SkillTree.of(entries);
}

/**
 * Reads a skill's folder in the project; undefined when there is no folder there.
 *
 * @example
 *   readSkillTree('/p/.agents/skills/retro')?.hash // => 'sha256:…'
 */
export function readSkillTree(dir: string): SkillTree | undefined {
  return readTree(dir, [LEFTOVER]);
}

/**
 * Reads a skill as a release ships it - from the installed package, a
 * checkout or a fetched tag, always the same files.
 *
 * @example
 *   readShippedSkillTree('/p/node_modules/@lukiita/toolbox/skills/retro')?.hash
 */
export function readShippedSkillTree(dir: string): SkillTree | undefined {
  return readTree(dir, [LEFTOVER, NOT_PACKAGED]);
}

function writeSkillFile(path: string, file: SkillFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, file.content);
  chmodSync(path, file.executable ? 0o755 : 0o644);
}

// Names of the two folders a write keeps beside the skill for a moment. They
// sit in `.agents/skills/` on purpose: the same folder is the same filesystem,
// which is what makes the renames below atomic.
const STAGING = '.toolbox-staging';
const SWAPPED_OUT = '.toolbox-old';

// Best effort, never a throw: this only clears what a write no longer needs.
// SKILL.md goes first and on its own - whatever else cannot be deleted (a
// __pycache__ a container wrote as root), a folder without it is not listed
// as a skill by any agent, and the next write tries again.
function discard(dir: string): void {
  try {
    rmSync(join(dir, 'SKILL.md'), { force: true });
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // What could not be deleted stays beside the skill, visible in `git status`.
  }
}

function swappedOutFolders(dir: string): string[] {
  const parent = dirname(dir);
  if (!existsSync(parent)) return [];
  return readdirSync(parent)
    .filter((entry) => entry.startsWith(`${basename(dir)}${SWAPPED_OUT}`))
    .map((entry) => join(parent, entry));
}

// Leftovers of an earlier write may still hold the plain name.
function freeNameBeside(dir: string): string {
  let candidate = `${dir}${SWAPPED_OUT}`;
  for (let attempt = 1; existsSync(candidate); attempt += 1) {
    candidate = `${dir}${SWAPPED_OUT}-${attempt}`;
  }
  return candidate;
}

/**
 * Moves `staging` into the place of `dir`. The old folder is renamed aside,
 * never deleted first: until 2.0's review this was "delete, then rename", and
 * a delete that failed half-way (or a run killed in between) left a skill
 * half-gone that the next install read as the project's own deletions.
 * Each rename is atomic; when the second one fails, the first is undone.
 *
 * @example
 *   swapSkillFolder('/p/.agents/skills/retro.toolbox-staging', '/p/.agents/skills/retro')
 */
export function swapSkillFolder(staging: string, dir: string): void {
  if (!existsSync(dir)) return renameSync(staging, dir);
  const aside = freeNameBeside(dir);
  renameSync(dir, aside);
  try {
    renameSync(staging, dir);
  } catch (e) {
    renameSync(aside, dir);
    throw e;
  }
  discard(aside);
}

/**
 * Makes the folder hold exactly the tree. Written beside it first and swapped
 * in, so a failure at any point leaves the old folder whole, not a mix.
 *
 * @example
 *   writeSkillTree('/p/.agents/skills/retro', shipped)
 */
export function writeSkillTree(dir: string, tree: SkillTree): void {
  const staging = `${dir}${STAGING}`;
  discard(staging);
  swappedOutFolders(dir).forEach(discard);
  mkdirSync(staging, { recursive: true });
  for (const [path, file] of tree.entries()) writeSkillFile(join(staging, path), file);
  swapSkillFolder(staging, dir);
}

/**
 * Undoes what a write that died left behind, before the folder is read: a
 * staging folder (agents would list it as a skill), and a folder swapped out
 * with nothing swapped in - read as it is, that skill would be "deleted by the
 * project" and never installed again.
 *
 * @example
 *   recoverSkillFolder('/p/.agents/skills/retro')
 */
export function recoverSkillFolder(dir: string): void {
  discard(`${dir}${STAGING}`);
  if (existsSync(dir)) return;
  // Only a whole folder: leftovers that could not be deleted have no SKILL.md.
  const whole = swappedOutFolders(dir).find((folder) => existsSync(join(folder, 'SKILL.md')));
  if (whole) renameSync(whole, dir);
}

/** `ours`: written by the link-era install, or dangling. `pinned`: the project's own link. */
export type SkillLinkKind = 'none' | 'ours' | 'pinned';

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// The link-era install wrote `../../node_modules/@lukiita/toolbox/skills/<name>`.
// Recognised by that path, not by the running package's location: `pnpm dlx`
// and `npx` run the toolbox from a cache while the link still points into the
// project's node_modules. The trailing "/" of each side makes it a path
// boundary - `@lukiita/toolbox-extra` is not ours.
const INSTALLED_SKILLS = '/node_modules/@lukiita/toolbox/skills/';

function pointsIntoToolbox(target: string, packageDir: string): boolean {
  if (`${target}/`.includes(INSTALLED_SKILLS)) return true;
  return `${realpathSync(target)}/`.startsWith(`${realpathSync(packageDir)}/skills/`);
}

/**
 * What kind of symlink sits where a skill goes, if any.
 *
 * @example
 *   skillLinkKind('/p/.agents/skills/retro', packageDir) // => 'ours' after a v1 install
 */
export function skillLinkKind(dest: string, packageDir: string): SkillLinkKind {
  if (!isSymlink(dest)) return 'none';
  // Resolved from where the link really lives: when `.agents/skills` is itself
  // a symlink, the nominal parent resolves a relative target from the wrong
  // place (link-skills, loop round 1).
  const target = resolve(realpathSync(dirname(dest)), readlinkSync(dest));
  // A dangling link is nobody's pin.
  if (!existsSync(target)) return 'ours';
  return pointsIntoToolbox(target, packageDir) ? 'ours' : 'pinned';
}
