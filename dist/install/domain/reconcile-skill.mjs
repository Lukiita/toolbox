// What `toolbox install` does with one skill (ADR-0003). Four things are
// compared: the manifest's record, the project's folder (`local`), the
// stored original (`base`) and what the running package ships (`shipped`).
//
// The rule the whole feature exists for: an edit the project made is never
// lost. So the only automatic write over an edited skill is a merge that
// settled every file; anything short of that leaves the folder as it is and
// says why. The outcome type carries that rule: a kept outcome has no tree
// to write, so no caller can write one by mistake.
import { mergeSkillTrees } from "./merge-skill-trees.mjs";
import { isOlderVersion } from "./toolbox-version.mjs";
function synced(status, local, files = []) {
    return local ? { synced: true, status, local, files } : { synced: true, status, files };
}
function kept(status, files = []) {
    return { synced: false, status, files };
}
function reconcileUnrecorded({ local, shipped }) {
    if (!local)
        return synced('copied', shipped);
    return local.equals(shipped) ? synced('adopted') : kept('unmanaged');
}
// Without the original there is no third side, and a two-way "merge" would
// read the project's edits as deletions to undo.
function mergeIntoEdited(sides, options) {
    const { base, local, shipped, record } = sides;
    if (base?.hash !== record.hash)
        return kept('base-lost');
    const { tree, merged, conflicts } = mergeSkillTrees({ base, ours: local, theirs: shipped }, options.mergeText);
    if (conflicts.length === 0)
        return synced('merged', tree, merged);
    return options.writeConflicts
        ? synced('conflict-marked', tree, conflicts)
        : kept('conflict', conflicts);
}
function reconcileRecorded(sides, options) {
    const { record, local, shipped } = sides;
    // Equal to the package: a plain re-run, the new version applied by hand, or
    // an install that died after writing the folder and before saving the manifest.
    if (local.equals(shipped))
        return synced('unchanged');
    if (shipped.hash === record.hash)
        return synced('altered');
    return local.hash === record.hash ? synced('updated', shipped) : mergeIntoEdited(sides, options);
}
/**
 * Decides what an install does with one skill. Pure: it reads the four sides
 * and returns what must be written.
 *
 * @example
 *   reconcileSkill({ record, local, base, shipped }, { version: '2.0.0', writeConflicts: false, mergeText })
 *   // => { synced: true, status: 'updated', local: shipped, files: [] }
 */
export function reconcileSkill(sides, options) {
    const { record, local } = sides;
    if (!record)
        return reconcileUnrecorded(sides);
    if (isOlderVersion(options.version, record.version))
        return kept('ahead');
    if (!local)
        return kept('removed');
    return reconcileRecorded({ ...sides, record, local }, options);
}
