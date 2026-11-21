// What `toolbox install` does with one skill (ADR-0003). Three things are
// compared: the manifest's record, the project's folder (`local`) and what
// the running package ships (`shipped`). A fourth, the original the project
// copied, is fetched from its release only when a merge needs it: the
// project does not keep a second copy of every skill.
//
// The rule the whole feature exists for: an edit the project made is never
// lost. So the only automatic write over an edited skill is a merge that
// settled every file; anything short of that leaves the folder as it is and
// says why. The outcome type carries that rule: a kept outcome has no tree
// to write, so no caller can write one by mistake.
import { mergeSkillTrees } from "./merge-skill-trees.mjs";
import { classifySkill } from "./skill-state.mjs";
function synced(status, local, files = []) {
    return local ? { synced: true, status, local, files } : { synced: true, status, files };
}
function kept(status, files = [], reason) {
    return reason === undefined
        ? { synced: false, status, files }
        : { synced: false, status, files, reason };
}
// Deleting the folder is how a project stops wanting a skill. The record goes
// too: kept as a marker, it outlived skills the toolbox later retired and
// printed "delete it if unused" about a folder that was gone (found in review).
const REMOVED = { synced: false, status: 'removed', files: [], dropsRecord: true };
function reconcileUnrecorded({ local, shipped, requested }) {
    if (local)
        return local.equals(shipped) ? synced('adopted') : kept('unmanaged');
    return requested ? synced('copied', shipped) : kept('available');
}
// The fetched release must be the one the project copied from. A tag that
// was moved, or a release packed differently, is not: merging against it
// would read as edits what the project never touched.
function recordedOriginal({ record, original }) {
    const lookup = original(record.version);
    if (!lookup.found || lookup.tree.hash === record.hash)
        return lookup;
    return {
        found: false,
        reason: `the ${record.version} release holds other content for this skill than the manifest recorded`,
    };
}
// Without the original there is no third side, and a two-way "merge" would
// read the project's edits as deletions to undo.
function mergeIntoEdited(sides, options) {
    const original = recordedOriginal(sides);
    if (!original.found)
        return kept('no-original', [], original.reason);
    const { tree, merged, conflicts } = mergeSkillTrees({ base: original.tree, ours: sides.local, theirs: sides.shipped }, options.mergeText);
    if (conflicts.length === 0)
        return synced('merged', tree, merged);
    return options.writeConflicts
        ? synced('conflict-marked', tree, conflicts)
        : kept('conflict', conflicts);
}
function reconcileRecorded(state, sides, options) {
    if (state.upstream === 'current')
        return synced(state.local === 'intact' ? 'unchanged' : 'altered');
    return state.local === 'intact'
        ? synced('updated', sides.shipped)
        : mergeIntoEdited(sides, options);
}
/**
 * Decides what an install does with one skill. It reads the sides and returns
 * what must be written; the one effect it may cause is `sides.original`.
 *
 * @example
 *   reconcileSkill({ record, local, shipped, original }, { version: '2.0.0', writeConflicts: false, mergeText })
 *   // => { synced: true, status: 'updated', local: shipped, files: [] }
 */
export function reconcileSkill(sides, options) {
    const { record, local } = sides;
    if (!record)
        return reconcileUnrecorded(sides);
    // Whether the skill is edited, behind or ahead is `classifySkill`'s to say,
    // for `toolbox skills` too; this function only maps the state to an action.
    const state = classifySkill(sides, options.version);
    if (state.upstream === 'ahead')
        return kept('ahead');
    if (!local)
        return REMOVED;
    return reconcileRecorded(state, { ...sides, record, local }, options);
}
/**
 * Decides what an install does with a recorded skill the running package does
 * not ship. Never a write: the folder is the project's to keep or delete.
 *
 * @example
 *   reconcileUnshipped({ record, local }, '2.1.0') // => { synced: false, status: 'retired', files: [] }
 */
export function reconcileUnshipped(recorded, runningVersion) {
    const state = classifySkill({ ...recorded, shipped: undefined }, runningVersion);
    if (state.upstream === 'ahead')
        return kept('ahead');
    return state.local === 'removed' ? REMOVED : kept('retired');
}
