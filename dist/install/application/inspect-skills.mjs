// `toolbox skills`: what differs between the project's skills, the manifest
// and what the running package ships (ADR-0003). ADR-0001 was written
// because copies drifted where nobody looked; this is the look.
//
// Read-only and offline on purpose: a status command that waits on the
// network gets skipped. The price is one case. With no copy of the original
// in the project, a file's changes can be told apart only while one side
// still IS the original: an edited skill is compared with the package when
// the package is unchanged, and a waiting version with the project's folder
// when that is unedited. When both moved, the files that differ are listed
// without saying whose change each is - `toolbox install` fetches the
// original and settles it.
import { classifySkill, } from "../domain/skill-state.mjs";
import { SKILLS_DIR } from "./skill-layout.mjs";
// A link is not a folder the manifest describes: it is named for what it is.
const LINK_STATES = {
    none: undefined,
    ours: 'linked',
    pinned: 'pinned',
};
// Each list is the same comparison, project against package; which list it
// goes in is which side still equals the original.
const LIST_OF = new Map([
    ['altered/current', 'alteredFiles'],
    ['intact/behind', 'behindFiles'],
    ['altered/behind', 'divergedFiles'],
]);
function differingFiles(sides, local, upstream) {
    const lists = { alteredFiles: [], behindFiles: [], divergedFiles: [] };
    const list = LIST_OF.get(`${local}/${upstream}`);
    if (!list || !sides.local || !sides.shipped)
        return lists;
    return { ...lists, [list]: sides.local.differingPaths(sides.shipped) };
}
const NO_FILES = { alteredFiles: [], behindFiles: [], divergedFiles: [] };
function inspectOne(name, manifest, { folders, version }) {
    // The link is asked about first: a link in a skill's place is never read through.
    const link = LINK_STATES[folders.linkKind(name)];
    const sides = {
        record: manifest.find(name),
        local: link ? undefined : folders.readLocal(name),
        shipped: folders.readShipped(name),
    };
    // The same classification `toolbox install` acts on: the two commands
    // cannot disagree about a skill.
    const state = classifySkill(sides, version);
    const local = link ?? state.local;
    return {
        name,
        version: sides.record?.version,
        local,
        upstream: state.upstream,
        ...differingFiles(sides, local, state.upstream),
        sides: { local: sides.local, shipped: sides.shipped },
    };
}
// One skill that cannot be read is reported, and the others are still
// inspected - as `install` does. Thrown, it stopped the whole command before
// a single line was printed (found in review).
function inspectOrReport(name, manifest, options) {
    try {
        return inspectOne(name, manifest, options);
    }
    catch (e) {
        return {
            name,
            version: manifest.find(name)?.version,
            local: 'unreadable',
            upstream: 'unknown',
            ...NO_FILES,
            sides: { local: undefined, shipped: undefined },
            reason: e instanceof Error ? e.message : String(e),
        };
    }
}
/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ folders, version: parseReleaseNumber('2.1.0') })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'current', alteredFiles: ['SKILL.md'], ... }]
 */
export function inspectSkills(options) {
    const manifest = options.folders.readManifest();
    const names = new Set([...options.folders.shipped(), ...manifest.names()]);
    return [...names].sort().map((name) => inspectOrReport(name, manifest, options));
}
function sideOf(tree, label, file) {
    return { label: `${label}/${file}`, content: tree?.file(file)?.content };
}
/**
 * The diffs behind one inspection, from the content already read: a file the
 * project's tree does not hold - absent, or behind a link - is absent. An
 * edit reads from the package (the original) to the project; a waiting
 * version, and files where both moved, read from the project to the package.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export function skillDiffs(inspection, diffFiles) {
    const { local, shipped } = inspection.sides;
    const project = `${SKILLS_DIR}/${inspection.name}`;
    const toolbox = `toolbox/${inspection.name}`;
    const toPackage = [...inspection.behindFiles, ...inspection.divergedFiles];
    return [
        ...inspection.alteredFiles.map((file) => diffFiles(sideOf(shipped, toolbox, file), sideOf(local, project, file))),
        ...toPackage.map((file) => diffFiles(sideOf(local, project, file), sideOf(shipped, toolbox, file))),
    ];
}
