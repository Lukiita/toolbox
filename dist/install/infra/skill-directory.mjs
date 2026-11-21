// The disk side of the installer: a skill's folder read into a `SkillTree`
// and written back from one, and the one question about symlinks the
// migration from the link-era install needs answered (ADR-0003).
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { PACKAGE_SKILLS_DIR } from "../application/skill-layout.mjs";
import { SkillTree } from "../domain/skill-tree.mjs";
/**
 * Every folder under the package's `skills/` that has a SKILL.md.
 *
 * @example
 *   shippedSkills('/p/node_modules/@lukiita/toolbox') // => ['code-review', 'retro', ...]
 */
export function shippedSkills(packageDir) {
    const dir = join(packageDir, PACKAGE_SKILLS_DIR);
    if (!existsSync(dir))
        return [];
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
function isDirectory(path) {
    return existsSync(path) && statSync(path).isDirectory();
}
function readSkillFile(path) {
    return { content: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}
// The files under a folder, walked by hand so that no symbolic link is ever
// followed. Node's own recursive listing does descend into a link to a
// folder (22 and later): a skill with `linked -> ../../somewhere` had the
// outside files read into its tree, shown by `toolbox skills --diff` and
// copied into the project by the next merge (found in review).
//
// So a symbolic link inside a skill, to a file or to a folder, is in no hash
// and does not survive a write of the skill's folder - a known limit, stated
// in ADR-0003: no shipped skill has one, and what a merge of two link targets
// should mean was not worth settling for a case nobody has.
function filesUnder(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory())
            return filesUnder(path);
        return entry.isFile() ? [path] : [];
    });
}
function readTree(dir, leftOut) {
    if (!isDirectory(dir))
        return undefined;
    const entries = filesUnder(dir)
        .map((path) => [relative(dir, path).split(sep).join('/'), path])
        .filter(([relativePath]) => !leftOut.some((pattern) => pattern.test(relativePath)))
        .map(([relativePath, path]) => [relativePath, readSkillFile(path)]);
    return SkillTree.of(entries);
}
/**
 * Reads a skill's folder in the project; undefined when there is no folder there.
 *
 * @example
 *   readSkillTree('/p/.agents/skills/retro')?.hash // => 'sha256:…'
 */
export function readSkillTree(dir) {
    return readTree(dir, [LEFTOVER]);
}
/**
 * Reads a skill as a release ships it - from the installed package, a
 * checkout or a fetched tag, always the same files.
 *
 * @example
 *   readShippedSkillTree('/p/node_modules/@lukiita/toolbox/skills/retro')?.hash
 */
export function readShippedSkillTree(dir) {
    return readTree(dir, [LEFTOVER, NOT_PACKAGED]);
}
function writeSkillFile(path, file) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
    chmodSync(path, file.executable ? 0o755 : 0o644);
}
// What a write keeps beside the skill for a moment: the new folder (staging),
// the old one renamed aside, and a marker naming it. They sit in
// `.agents/skills/` on purpose: the same folder is the same filesystem, which
// is what makes the renames below atomic.
const STAGING = '.toolbox-staging';
const SWAPPED_OUT = '.toolbox-old';
const SWAP_MARKER = '.toolbox-swap';
// What is at a path, without following a link: `existsSync` answers for the
// link's target, which is the wrong question for everything below.
function entryKind(path) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat)
        return 'absent';
    if (stat.isSymbolicLink())
        return 'link';
    return stat.isDirectory() ? 'folder' : 'other';
}
// Best effort, never a throw: this only clears what a write no longer needs,
// and the new folder is already in place. Returns whether the path is gone,
// so the caller can say when it is not.
//
// A symbolic link is unlinked and nothing more. A repository can commit a
// link under any of the names above; cleared as a folder, the SKILL.md of
// whatever it pointed at was deleted, outside the project (found in review).
//
// In a real folder SKILL.md goes first and on its own: whatever else cannot
// be deleted (a __pycache__ a container wrote as root), a folder without it
// is not listed as a skill by any agent.
function discard(path) {
    try {
        if (entryKind(path) === 'folder')
            rmSync(join(path, 'SKILL.md'), { force: true });
        // On a link, a recursive rm removes the link itself and stops there.
        rmSync(path, { recursive: true, force: true });
    }
    catch {
        // Reported by the caller: `writeSkillTree` hands the path back.
    }
    return entryKind(path) === 'absent';
}
function swappedOutName(dir) {
    const name = basename(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${name}${SWAPPED_OUT.replace('.', '\\.')}(-\\d+)?$`);
}
function swappedOutEntries(dir) {
    const parent = dirname(dir);
    if (!existsSync(parent))
        return [];
    const mine = swappedOutName(dir);
    return readdirSync(parent)
        .filter((entry) => mine.test(entry))
        .map((entry) => join(parent, entry));
}
// Leftovers of an earlier write may still hold the plain name.
function freeNameBeside(dir) {
    let candidate = `${dir}${SWAPPED_OUT}`;
    for (let attempt = 1; entryKind(candidate) !== 'absent'; attempt += 1) {
        candidate = `${dir}${SWAPPED_OUT}-${attempt}`;
    }
    return candidate;
}
/**
 * Moves `staging` into the place of `dir`. What is there is renamed aside,
 * never deleted first: until 2.0's review this was "delete, then rename", and
 * a delete that failed half-way (or a run killed in between) left a skill
 * half-gone that the next install read as the project's own deletions.
 * Each rename is atomic; when the second one fails, the first is undone.
 * A marker names the folder set aside while the two renames are under way,
 * so a run killed between them can be undone exactly (`recoverSkillFolder`).
 * Returns the old folder when it could not be deleted afterwards.
 *
 * @example
 *   swapSkillFolder('/p/.agents/skills/retro.toolbox-staging', '/p/.agents/skills/retro')
 */
export function swapSkillFolder(staging, dir) {
    if (entryKind(dir) === 'absent')
        return void renameSync(staging, dir);
    const aside = freeNameBeside(dir);
    const marker = `${dir}${SWAP_MARKER}`;
    writeFileSync(marker, basename(aside));
    renameSync(dir, aside);
    try {
        renameSync(staging, dir);
    }
    catch (e) {
        renameSync(aside, dir);
        throw e;
    }
    finally {
        rmSync(marker, { force: true });
    }
    return discard(aside) ? undefined : aside;
}
function writeStaging(staging, tree) {
    mkdirSync(staging, { recursive: true });
    for (const [path, file] of tree.entries())
        writeSkillFile(join(staging, path), file);
}
/**
 * Makes the folder hold exactly the tree. Written beside it first and swapped
 * in, so a failure at any point leaves the old folder whole, not a mix - and
 * no staging folder, which holds a SKILL.md and would be listed as a skill.
 * Returns the old folder when it could not be deleted, for the caller to report.
 *
 * @example
 *   writeSkillTree('/p/.agents/skills/retro', shipped)
 */
export function writeSkillTree(dir, tree) {
    const staging = `${dir}${STAGING}`;
    discard(staging);
    swappedOutEntries(dir).forEach(discard);
    try {
        writeStaging(staging, tree);
        return swapSkillFolder(staging, dir);
    }
    catch (e) {
        discard(staging);
        throw e;
    }
}
// The folder the marker names, when it is one a swap of this skill could have
// set aside: a real folder, beside the skill, under a swapped-out name. The
// marker is a file in the repository; what it says is checked, not followed.
function folderSetAside(dir) {
    const marker = `${dir}${SWAP_MARKER}`;
    if (entryKind(marker) !== 'other')
        return undefined;
    const named = readFileSync(marker, 'utf8').trim();
    const aside = join(dirname(dir), named);
    return swappedOutName(dir).test(named) && entryKind(aside) === 'folder' ? aside : undefined;
}
/**
 * Undoes a write that died between its two renames, before the folder is
 * read: the old folder is beside its place and the new one never moved in.
 * Read as it is, that skill would be "deleted by the project".
 *
 * The marker the swap wrote says which folder to put back. Without one there
 * was no dead write: an old folder that merely could not be deleted stays
 * where it is. Guessed from the folders present, a leftover was put back in
 * place of the real one, which the next write then deleted (found in review).
 *
 * @example
 *   recoverSkillFolder('/p/.agents/skills/retro')
 */
export function recoverSkillFolder(dir) {
    const aside = folderSetAside(dir);
    if (aside && entryKind(dir) === 'absent')
        renameSync(aside, dir);
    discard(`${dir}${SWAP_MARKER}`);
    // A staging folder holds a SKILL.md: left there, agents list it as a skill.
    discard(`${dir}${STAGING}`);
}
function isSymlink(path) {
    try {
        return lstatSync(path).isSymbolicLink();
    }
    catch {
        return false;
    }
}
// The link-era install wrote `../../node_modules/@lukiita/toolbox/skills/<name>`.
// Recognised by that path, not by the running package's location: `pnpm dlx`
// and `npx` run the toolbox from a cache while the link still points into the
// project's node_modules. The trailing "/" of each side makes it a path
// boundary - `@lukiita/toolbox-extra` is not ours.
const INSTALLED_SKILLS = '/node_modules/@lukiita/toolbox/skills/';
function pointsIntoToolbox(target, packageDir) {
    if (`${target}/`.includes(INSTALLED_SKILLS))
        return true;
    return `${realpathSync(target)}/`.startsWith(`${realpathSync(packageDir)}/skills/`);
}
/**
 * What kind of symlink sits where a skill goes, if any.
 *
 * @example
 *   skillLinkKind('/p/.agents/skills/retro', packageDir) // => 'ours' after a v1 install
 */
export function skillLinkKind(dest, packageDir) {
    if (!isSymlink(dest))
        return 'none';
    // Resolved from where the link really lives: when `.agents/skills` is itself
    // a symlink, the nominal parent resolves a relative target from the wrong
    // place (link-skills, loop round 1).
    const target = resolve(realpathSync(dirname(dest)), readlinkSync(dest));
    // A dangling link is nobody's pin.
    if (!existsSync(target))
        return 'ours';
    return pointsIntoToolbox(target, packageDir) ? 'ours' : 'pinned';
}
