// Which skills a project gets (ADR-0003): what the caller asked for, what the
// package offers to pick from, and whether anything has to be asked at all.
// Apart from `install-skills.mts`, which acts on a selection: a change to how
// skills are offered should not open the module that writes them.
import { describeSkill } from "../domain/skill-catalog.mjs";
/**
 * The skills the package ships, each with a line about it: what a person
 * picks from.
 *
 * @example
 *   skillCatalog(folders) // => [{ name: 'code-review', summary: 'Reviews the branch diff…' }, ...]
 */
export function skillCatalog(folders) {
    return folders.shipped().map((name) => {
        const shipped = folders.readShipped(name);
        return { name, summary: shipped ? describeSkill(shipped).summary : '' };
    });
}
/**
 * Whether the project already has skills from the toolbox: a manifest with
 * records, or a link the 1.x install wrote.
 *
 * @example
 *   hasInstalledSkills(folders) // => false in a project that never ran install
 */
export function hasInstalledSkills(folders) {
    if (folders.readManifest().names().length > 0)
        return true;
    return folders.shipped().some((name) => folders.linkKind(name) === 'ours');
}
/**
 * Whether somebody has to be asked which skills the project gets: it has
 * none yet, and the command named none. With skills already there, a plain
 * install just brings them up to date.
 *
 * @example
 *   needsSelection({ names: [], all: false }, folders) // => true in a fresh project
 */
export function needsSelection(asked, folders) {
    if (asked.all || asked.names.length > 0)
        return false;
    return !hasInstalledSkills(folders);
}
