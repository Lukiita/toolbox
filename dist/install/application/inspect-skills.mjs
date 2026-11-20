// `toolbox skills`: what differs between the project's skills, their
// originals and what the running package ships (ADR-0003). ADR-0001 was
// written because copies drifted where nobody looked; this is the look.
// Read-only: it never writes.
import { join } from 'node:path';
import { isOlderVersion } from "../domain/toolbox-version.mjs";
import { readSkillTree, shippedSkills, skillLinkKind, } from "../infra/skill-directory.mjs";
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
// The files are named against the original. Without a sound one there is
// nothing to name them against, and a guess would blame the wrong side.
function differing(original, other) {
    return original && other ? original.differingPaths(other) : [];
}
// The stored original, when it still is the one the manifest recorded.
function soundBase({ record, base }) {
    return base?.hash === record?.hash ? base : undefined;
}
function readSides(paths, record) {
    return {
        record,
        local: readSkillTree(paths.local),
        base: readSkillTree(paths.base),
        shipped: readSkillTree(paths.shipped),
    };
}
function inspectOne(name, manifest, options) {
    const paths = skillPaths(options, name);
    const sides = readSides(paths, manifest.find(name));
    const local = localState(sides, skillLinkKind(paths.local, options.packageDir));
    const upstream = upstreamState(sides, options.version);
    const original = soundBase(sides);
    return {
        name,
        version: sides.record?.version,
        local,
        upstream,
        alteredFiles: local === 'altered' ? differing(original, sides.local) : [],
        behindFiles: upstream === 'behind' ? differing(original, sides.shipped) : [],
        baseLost: sides.record !== undefined && original === undefined,
        paths,
    };
}
/**
 * The state of every skill the package ships or the manifest records, by name.
 *
 * @example
 *   inspectSkills({ packageDir, projectRoot: '/p', version: '2.1.0' })
 *   // => [{ name: 'ddd-tactical', local: 'altered', upstream: 'behind', alteredFiles: ['SKILL.md'], ... }]
 */
export function inspectSkills(options) {
    const manifest = readSkillManifest(options.projectRoot);
    const names = new Set([...shippedSkills(options.packageDir), ...manifest.names()]);
    return [...names].sort().map((name) => inspectOne(name, manifest, options));
}
/**
 * The diffs behind one inspection: what the project changed, then what the
 * package changed, each against the original.
 *
 * @example
 *   skillDiffs(inspection, gitFileDiff).join('\n')
 */
export function skillDiffs(inspection, diffFiles) {
    const { base, local, shipped } = inspection.paths;
    return [
        ...inspection.alteredFiles.map((file) => diffFiles(join(base, file), join(local, file))),
        ...inspection.behindFiles.map((file) => diffFiles(join(base, file), join(shipped, file))),
    ];
}
