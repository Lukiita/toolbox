// The disk side of the installer: a skill's folder read into a `SkillTree`
// and written back from one, and the one question about symlinks the
// migration from the link-era install needs answered (ADR-0003).
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { SkillTree } from "../domain/skill-tree.vo.mjs";
/**
 * Every folder under the package's `skills/` that has a SKILL.md.
 *
 * @example
 *   shippedSkills('/p/node_modules/@lukiita/toolbox') // => ['code-review', 'retro', ...]
 */
export function shippedSkills(packageDir) {
    const dir = join(packageDir, 'skills');
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
function treeEntry(dir, entry) {
    const path = join(entry.parentPath, entry.name);
    return [relative(dir, path).split(sep).join('/'), readSkillFile(path)];
}
function readTree(dir, leftOut) {
    if (!isDirectory(dir))
        return undefined;
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
/**
 * Makes the folder hold exactly the tree. Written beside it first and swapped
 * in, so a run that dies half-way leaves the old folder whole, not a mix.
 *
 * @example
 *   writeSkillTree('/p/.agents/skills/retro', shipped)
 */
export function writeSkillTree(dir, tree) {
    const staging = `${dir}.toolbox-staging`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    for (const [path, file] of tree.entries())
        writeSkillFile(join(staging, path), file);
    rmSync(dir, { recursive: true, force: true });
    renameSync(staging, dir);
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
