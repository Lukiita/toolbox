// `toolbox install`: copies the skills the package ships into the project,
// as files the project versions and may edit (ADR-0003). Until 2.0 this
// linked them; the links hid the content from git and from a reviewer, and
// asked for Node in a repository that only wanted the markdown.
//
// This module is the plumbing: it reads the sides of each skill, asks the
// domain what to do (`reconcile-skill.mts`) and writes what it answers.
// No rule lives here.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { reconcileSkill, } from "../domain/reconcile-skill.mjs";
import { readShippedSkillTree, readSkillTree, shippedSkills, skillLinkKind, writeSkillTree, } from "../infra/skill-directory.mjs";
import { skillPaths } from "../infra/skill-layout.mjs";
import { readSkillManifest, writeSkillManifest } from "../infra/skill-manifest-file.mjs";
// The skill as the release the record names shipped it.
function originalFrom(releases, name, version) {
    const release = releases.fetch(version);
    if (!release.fetched)
        return { found: false, reason: release.reason };
    const tree = readShippedSkillTree(join(release.packageDir, 'skills', name));
    if (tree)
        return { found: true, tree };
    return { found: false, reason: `the ${version} release has no skill named ${name}` };
}
function readSides(paths, name, context) {
    return {
        record: context.manifest.find(name),
        local: readSkillTree(paths.local),
        // `shippedSkills` listed the folder, so it is there.
        shipped: readShippedSkillTree(paths.shipped),
        original: (version) => originalFrom(context.options.pastReleases, name, version),
    };
}
function reportOf(name, outcome) {
    const report = { name, status: outcome.status, files: outcome.files };
    if (outcome.synced || outcome.reason === undefined)
        return report;
    return { ...report, reason: outcome.reason };
}
function installOne(name, context) {
    const { manifest, options } = context;
    const paths = skillPaths(options, name);
    const link = skillLinkKind(paths.local, options.packageDir);
    if (link === 'pinned')
        return { name, status: 'pinned', files: [] };
    // A link from the link-era install: the copy takes its place. Removing the
    // link never touches what it points at.
    if (link === 'ours')
        rmSync(paths.local);
    const sides = readSides(paths, name, context);
    const outcome = reconcileSkill(sides, options);
    if (outcome.synced) {
        if (outcome.local)
            writeSkillTree(paths.local, outcome.local);
        manifest.record(name, { version: options.version, hash: sides.shipped.hash });
    }
    return reportOf(name, outcome);
}
/**
 * Brings the project's `.agents/skills/` up to what the package ships,
 * without losing an edit the project made. Idempotent.
 *
 * @example
 *   installSkills({ packageDir, projectRoot: '/p', version: '2.0.0', writeConflicts: false, mergeText: gitTextMerge, pastReleases })
 *   // => [{ name: 'code-review', status: 'copied', files: [] }, ...]
 */
export function installSkills(options) {
    try {
        const manifest = readSkillManifest(options.projectRoot);
        const shipped = shippedSkills(options.packageDir);
        const reports = shipped.map((name) => installOne(name, { manifest, options }));
        const retired = manifest.names().filter((name) => !shipped.includes(name));
        writeSkillManifest(options.projectRoot, manifest);
        return [
            ...reports,
            ...retired.map((name) => ({ name, status: 'retired', files: [] })),
        ];
    }
    finally {
        options.pastReleases.dispose();
    }
}
