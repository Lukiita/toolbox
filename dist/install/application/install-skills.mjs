// `toolbox install`: copies the skills the package ships into the project,
// as files the project versions and may edit (ADR-0003). Until 2.0 this
// linked them; the links hid the content from git and from a reviewer, and
// asked for Node in a repository that only wanted the markdown.
//
// This module is the plumbing: it reads the four sides of each skill, asks
// the domain what to do (`reconcile-skill.mts`) and writes what it answers.
// No rule lives here.
import { rmSync } from 'node:fs';
import { reconcileSkill, } from "../domain/reconcile-skill.mjs";
import { readSkillTree, shippedSkills, skillLinkKind, writeSkillTree, } from "../infra/skill-directory.mjs";
import { skillPaths } from "../infra/skill-layout.mjs";
import { readSkillManifest, writeSkillManifest } from "../infra/skill-manifest-file.mjs";
function readSides(paths, manifest, name) {
    return {
        record: manifest.find(name),
        local: readSkillTree(paths.local),
        base: readSkillTree(paths.base),
        // `shippedSkills` listed the folder, so it is there.
        shipped: readSkillTree(paths.shipped),
    };
}
// The base is rewritten only when it differs, so an install that changed
// nothing touches no file. The same write puts back a base that went missing.
function applyOutcome(outcome, sides, paths) {
    if (!outcome.synced)
        return;
    if (outcome.local)
        writeSkillTree(paths.local, outcome.local);
    if (!sides.base?.equals(sides.shipped))
        writeSkillTree(paths.base, sides.shipped);
}
function installOne(name, manifest, options) {
    const paths = skillPaths(options, name);
    const link = skillLinkKind(paths.local, options.packageDir);
    if (link === 'pinned')
        return { name, status: 'pinned', files: [] };
    // A link from the link-era install: the copy takes its place. Removing the
    // link never touches what it points at.
    if (link === 'ours')
        rmSync(paths.local);
    const sides = readSides(paths, manifest, name);
    const outcome = reconcileSkill(sides, options);
    applyOutcome(outcome, sides, paths);
    if (outcome.synced)
        manifest.record(name, { version: options.version, hash: sides.shipped.hash });
    return { name, status: outcome.status, files: outcome.files };
}
/**
 * Brings the project's `.agents/skills/` up to what the package ships,
 * without losing an edit the project made. Idempotent.
 *
 * @example
 *   installSkills({ packageDir, projectRoot: '/p', version: '2.0.0', writeConflicts: false, mergeText: gitTextMerge })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, ...]
 */
export function installSkills(options) {
    const manifest = readSkillManifest(options.projectRoot);
    const shipped = shippedSkills(options.packageDir);
    const reports = shipped.map((name) => installOne(name, manifest, options));
    const retired = manifest.names().filter((name) => !shipped.includes(name));
    writeSkillManifest(options.projectRoot, manifest);
    return [
        ...reports,
        ...retired.map((name) => ({ name, status: 'retired', files: [] })),
    ];
}
