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
import { join } from 'node:path';
import { isOlderVersion } from "../domain/toolbox-version.mjs";
import { readShippedSkillTree, readSkillTree, shippedSkills, skillLinkKind, } from "../infra/skill-directory.mjs";
import { skillPaths } from "../infra/skill-layout.mjs";
import { readSkillManifest } from "../infra/skill-manifest-file.mjs";
function recordedState(local, record) {
    if (!local)
        return 'removed';
    return local.hash === record.hash ? 'intact' : 'altered';
}
function localState({ record, local }, link) {
    if (link === 'ours')
        return 'linked';
    if (link === 'pinned')
        return 'pinned';
    if (record)
        return recordedState(local, record);
    return local ? 'unmanaged' : 'not-installed';
}
function upstreamState({ record, shipped }, version) {
    if (!record)
        return 'untracked';
    if (!shipped)
        return 'retired';
    if (isOlderVersion(version, record.version))
        return 'ahead';
    return shipped.hash === record.hash ? 'current' : 'behind';
}
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
function inspectOne(name, manifest, options) {
    const paths = skillPaths(options, name);
    const sides = {
        record: manifest.find(name),
        local: readSkillTree(paths.local),
        shipped: readShippedSkillTree(paths.shipped),
    };
    const local = localState(sides, skillLinkKind(paths.local, options.packageDir));
    const upstream = upstreamState(sides, options.version);
    return {
        name,
        version: sides.record?.version,
        local,
        upstream,
        ...differingFiles(sides, local, upstream),
        paths,
    };
}
/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ packageDir, projectRoot: '/p', version: '2.1.0' })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'current', alteredFiles: ['SKILL.md'], ... }]
 */
export function inspectSkills(options) {
    const manifest = readSkillManifest(options.projectRoot);
    const names = new Set([...shippedSkills(options.packageDir), ...manifest.names()]);
    return [...names].sort().map((name) => inspectOne(name, manifest, options));
}
/**
 * The diffs behind one inspection. An edit reads from the package (the
 * original) to the project; a waiting version, and files where both moved,
 * read from the project to the package.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export function skillDiffs(inspection, diffFiles) {
    const { local, shipped } = inspection.paths;
    const toPackage = [...inspection.behindFiles, ...inspection.divergedFiles];
    return [
        ...inspection.alteredFiles.map((file) => diffFiles(join(shipped, file), join(local, file))),
        ...toPackage.map((file) => diffFiles(join(local, file), join(shipped, file))),
    ];
}
