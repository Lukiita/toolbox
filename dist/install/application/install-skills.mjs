// `toolbox install`: copies the skills a project picked into the project, as
// files it versions and may edit (ADR-0003). Until 2.0 this linked every
// skill; the links hid the content from git and from a reviewer, and asked
// for Node in a repository that only wanted the markdown.
//
// This module is the plumbing: it works out which skills the project asked
// for, reads the sides of each, asks the domain what to do
// (`reconcile-skill.mts`) and writes what it answers. No rule lives here.
import { reconcileSkill, reconcileUnshipped, } from "../domain/reconcile-skill.mjs";
import { describeSkill } from "../domain/skill-catalog.mjs";
/** A name on the command line that is not a skill the package ships. */
export class UnknownSkillError extends Error {
}
function assertShipped(names, shipped) {
    const unknown = names.find((name) => !shipped.includes(name));
    if (unknown === undefined)
        return;
    throw new UnknownSkillError(`unknown skill: received ${JSON.stringify(unknown)}, expected one of ${shipped.join(', ')}`);
}
// A skill about to be added brings the siblings its files reach, or it would
// arrive with a dead path in it. Only on the way in: a skill the project
// already has does not bring back a sibling the project deleted.
function needsOf(name, manifest, folders) {
    if (manifest.find(name))
        return [];
    try {
        const shipped = folders.readShipped(name);
        return shipped ? describeSkill(shipped).needs : [];
    }
    catch {
        // An unreadable skill is reported as failed when its own turn comes.
        return [];
    }
}
function requestedSkills(manifest, { folders, select }, shipped) {
    const asked = select.all ? shipped : select.names;
    const requested = new Map(asked.map((name) => [name, undefined]));
    const pending = [...asked];
    for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
        const by = name;
        const added = needsOf(by, manifest, folders).filter((sibling) => shipped.includes(sibling) && !requested.has(sibling));
        added.forEach((sibling) => requested.set(sibling, by));
        pending.push(...added);
    }
    return requested;
}
function readSides(name, record, run) {
    const { folders, pastReleases } = run.options;
    return {
        record,
        local: folders.readLocal(name),
        // `folders.shipped()` listed the skill, so it is there.
        shipped: folders.readShipped(name),
        requested: run.requested.has(name),
        original: (version) => pastReleases.skill(version, name),
    };
}
// Writes what the domain decided for a shipped skill and moves its record;
// returns an old folder that could not be deleted, if any.
function write(name, outcome, shipped, { manifest, options }) {
    if (!outcome.synced)
        return undefined;
    const leftover = outcome.local ? options.folders.writeLocal(name, outcome.local) : undefined;
    manifest.record(name, { version: options.version, hash: shipped.hash });
    return leftover;
}
function dropRecord(name, outcome, manifest) {
    if (!outcome.synced && outcome.dropsRecord)
        manifest.forget(name);
}
function reasonsOf(name, outcome, leftover, run) {
    const neededBy = run.requested.get(name);
    return [
        outcome.synced ? undefined : outcome.reason,
        outcome.status === 'copied' && neededBy ? `needed by ${neededBy}` : undefined,
        leftover ? `the old folder could not be deleted; remove ${leftover} by hand` : undefined,
    ].filter((reason) => reason !== undefined);
}
function reportOf(name, outcome, leftover, run) {
    dropRecord(name, outcome, run.manifest);
    const report = { name, status: outcome.status, files: outcome.files };
    const reasons = reasonsOf(name, outcome, leftover, run);
    return reasons.length === 0 ? report : { ...report, reason: reasons.join('; ') };
}
function installShipped(name, run) {
    const { folders } = run.options;
    const link = folders.linkKind(name);
    if (link === 'pinned')
        return { name, status: 'pinned', files: [] };
    // A link the 1.x install wrote stands for the skill it pointed at: the
    // project had it, so the copy takes its place whatever the manifest says.
    // Decided from a record that described no folder, this skill came out
    // "deleted by the project" and was never copied (found in review).
    const linked = link === 'ours';
    if (linked)
        folders.removeLink(name);
    folders.recover(name);
    const sides = readSides(name, linked ? undefined : run.manifest.find(name), run);
    const outcome = reconcileSkill({ ...sides, requested: linked || sides.requested }, run.options);
    return reportOf(name, outcome, write(name, outcome, sides.shipped, run), run);
}
// Recorded, and not in the running package: never a write.
function installUnshipped(name, run) {
    const record = run.manifest.find(name);
    const local = run.options.folders.readLocal(name);
    return reportOf(name, reconcileUnshipped({ record, local }, run.options.version), undefined, run);
}
// One skill that cannot be settled (an unreadable file, a path the tree
// refuses) is reported and the others go on: thrown, it left every skill
// after it in the alphabet untouched, with no line saying so (found in review).
function settled(name, install, run) {
    let report;
    try {
        report = install();
    }
    catch (e) {
        report = {
            name,
            status: 'failed',
            files: [],
            reason: e instanceof Error ? e.message : String(e),
        };
    }
    run.options.onReport?.(report);
    return report;
}
function installAll(manifest, options) {
    const shipped = options.folders.shipped();
    assertShipped(options.select.names, shipped);
    const run = {
        manifest,
        options,
        requested: requestedSkills(manifest, options, shipped),
    };
    const reports = shipped.map((name) => settled(name, () => installShipped(name, run), run));
    const unshipped = manifest.names().filter((name) => !shipped.includes(name));
    return [
        ...reports,
        ...unshipped.map((name) => settled(name, () => installUnshipped(name, run), run)),
    ];
}
/**
 * Brings the skills the project picked up to what the package ships, without
 * losing an edit the project made. Skills already recorded are always
 * settled; `select` adds to them. Idempotent.
 *
 * @example
 *   installSkills({ folders, pastReleases, mergeText: gitTextMerge, version: '2.0.0', writeConflicts: false, select: { names: ['code-review'], all: false } })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, { name: 'sql-quality', status: 'copied', files: [], reason: 'needed by code-review' }, ...]
 */
export function installSkills(options) {
    try {
        const manifest = options.folders.readManifest();
        try {
            return installAll(manifest, options);
        }
        finally {
            // Also when the run stops early: the skills already written keep their
            // records. Saved only at the end of a clean run, a failure left folders
            // at the new version under records of the old one (found in review).
            options.folders.saveManifest(manifest);
        }
    }
    finally {
        options.pastReleases.dispose();
    }
}
/**
 * Whether the project already has skills from the toolbox: a manifest with
 * records, or a link the 1.x install wrote. When it has none and asks for
 * none, there is nothing an install can do but ask which ones.
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
