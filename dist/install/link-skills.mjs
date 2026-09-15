// Puts the package's skills where every agent reads them: `.agents/skills/`
// in the project. A symlink per skill, so an update of the package is an
// update of the skill with no copy to drift - the same reason the toolbox
// links `~/.agents/skills` on a machine.
//
// Only the skills the package ships are touched. A project keeps its own
// skills in the same folder (project-c has twenty), and a real directory with a
// package skill's name is the project's, never replaced - it is reported so
// the owner decides.
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync, } from 'node:fs';
import { join, relative, resolve } from 'node:path';
/**
 * Every folder under `skills/` that has a SKILL.md.
 *
 * @example
 *   shippedSkills('/p/node_modules/@lukiita/toolbox') // => ['code-review', 'retro', ...]
 */
export function shippedSkills(packageDir) {
    const dir = join(packageDir, 'skills');
    if (!existsSync(dir))
        return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
        .map((e) => e.name)
        .sort();
}
// A link the project made itself - pointing anywhere but into the package -
// is the project's pin, kept like a real directory would be. Only our own
// links (into the package) and dangling ones are replaced.
function isForeignLink(dest, packageDir) {
    const target = resolve(dest, '..', readlinkSync(dest));
    return existsSync(target) && !target.startsWith(packageDir);
}
function isPresent(dest) {
    return existsSync(dest) || isSymlink(dest);
}
function destState(dest, packageDir, wanted) {
    if (!isPresent(dest))
        return 'absent';
    if (!isSymlink(dest))
        return 'kept';
    if (isForeignLink(dest, packageDir))
        return 'kept';
    return readlinkSync(dest) === wanted ? 'unchanged' : 'replace';
}
function linkOne(name, target, dest, packageDir, summary) {
    const wanted = relative(resolve(dest, '..'), target);
    const state = destState(dest, packageDir, wanted);
    if (state === 'kept')
        return void summary.kept.push(name);
    if (state === 'unchanged')
        return void summary.unchanged.push(name);
    if (state === 'replace')
        unlinkSync(dest);
    // Relative, so the project can move and a container sees the same tree.
    symlinkSync(wanted, dest, 'dir');
    summary.linked.push(name);
}
function isSymlink(path) {
    try {
        return lstatSync(path).isSymbolicLink();
    }
    catch {
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
export function linkSkills({ packageDir, projectRoot }) {
    const skillsDir = join(projectRoot, '.agents', 'skills');
    mkdirSync(skillsDir, { recursive: true });
    const summary = { linked: [], unchanged: [], kept: [] };
    for (const name of shippedSkills(packageDir)) {
        linkOne(name, join(packageDir, 'skills', name), join(skillsDir, name), packageDir, summary);
    }
    return summary;
}
