#!/usr/bin/env node
// `toolbox` - the command line of the package.
//
//   toolbox quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]
//   toolbox pre-push        (git's pre-push stdin; install as .husky/pre-push)
//   toolbox install         (links the shipped skills into .agents/skills/)
//
// Exit codes: 0 ok, 1 the ratchet failed, 2 usage error - whoever reads a CI
// log needs to tell the last two apart.
//
// Ships built (`dist/`, committed): Node refuses to strip types under
// node_modules, and pnpm 12 refuses a git dependency's build script unless the
// consumer allowlists it per commit - so nothing runs on install (ADR-0001).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadToolboxConfig } from "../config/load-config.mjs";
import { linkSkills } from "../install/link-skills.mjs";
import { decidePrePush, parsePushedRefs } from "../pre-push/pre-push.mjs";
import { parseArgs, UsageError } from "../quality-gate/args.mjs";
import { runQualityGate } from "../quality-gate/run-gate.mjs";
import * as git from "./git-ports.mjs";
const USAGE = 'Usage: toolbox quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]\n' +
    '       toolbox pre-push\n' +
    '       toolbox install';
function quality(root, config, args) {
    let options;
    try {
        options = parseArgs(args);
    }
    catch (e) {
        if (!(e instanceof UsageError))
            throw e;
        console.error(`${e.message}\n${USAGE}`);
        return 2;
    }
    const result = runQualityGate({ root, config: config.quality, warn: console.error }, options);
    if (result.status === 'refrozen') {
        console.log('baseline re-frozen in quality-baseline.json');
        return 0;
    }
    console.log(result.report);
    // Relative to the cwd, as any CLI: the CI step that reads the file runs
    // where it wrote it, and a monorepo package may run the gate from its own dir.
    if (options.out)
        writeReport(resolve(process.cwd(), options.out), result.report ?? '');
    return result.status === 'failed' ? 1 : 0;
}
function writeReport(path, report) {
    try {
        writeFileSync(path, `${report}\n`);
    }
    catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        console.error(`could not write the report to ${path} (${reason}); it was printed above`);
    }
}
function prePushPorts(root, config) {
    const reports = git.gitDir(root);
    return {
        baseTip: () => git.baseTip(root, config.quality.baseBranch),
        mergeBase: (a, b) => git.mergeBase(root, a, b),
        hasCommit: (sha) => git.hasCommit(root, sha),
        touchesCode: (from, to) => git.touchesCode(root, from, to),
        baselineChanged: (from, to) => git.baselineChanged(root, from, to),
        gate: (baselineFrom) => {
            const out = join(reports, baselineFrom ? 'quality-pre-push.md' : 'quality-pre-push-own.md');
            const result = runQualityGate({ root, config: config.quality, warn: console.error }, { updateBaseline: false, skipTests: config.quality.prePushSkipTests, baselineFrom });
            writeReport(out, result.report ?? '');
            return { passed: result.status === 'passed', failures: result.failures, reportPath: out };
        },
    };
}
function prePush(root, config) {
    const refs = parsePushedRefs(readFileSync(0, 'utf8'));
    const decision = decidePrePush(refs, git.headSha(root), config.quality.baseBranch, prePushPorts(root, config));
    for (const line of decision.lines)
        console.log(line);
    return decision.exitCode;
}
// The package as the project sees it (`node_modules/@lukiita/toolbox`), so the
// links stay relative to the project and survive a moved pnpm store. Only a
// checkout of the toolbox itself, run from inside it, falls back to its own path.
function installedPackageDir(root) {
    const inProject = resolve(root, 'node_modules', '@lukiita', 'toolbox');
    if (existsSync(inProject))
        return inProject;
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}
function install(root) {
    const summary = linkSkills({ packageDir: installedPackageDir(root), projectRoot: root });
    for (const name of summary.linked)
        console.log(`link:   .agents/skills/${name}`);
    for (const name of summary.unchanged)
        console.log(`ok:     .agents/skills/${name}`);
    for (const name of summary.kept) {
        console.log(`kept:   .agents/skills/${name} (the project's own directory; not replaced)`);
    }
    return 0;
}
async function main(argv) {
    const [command, ...rest] = argv;
    const root = git.repoRoot(process.cwd());
    // `install` is the project's postinstall: it must not depend on a config it
    // never reads, or a config typo breaks `pnpm install` (found in review).
    if (command === 'install')
        return install(root);
    if (command === 'quality')
        return quality(root, await loadToolboxConfig(root), rest);
    if (command === 'pre-push')
        return prePush(root, await loadToolboxConfig(root));
    console.error(`unknown command: ${command ?? '(none)'}\n${USAGE}`);
    return 2;
}
// A setup error (bad config, missing baseline or coverage json, jscpd not
// found) is not "the ratchet failed": it exits 2 with its own message, so a
// CI log never reads a config typo as a quality regression.
try {
    process.exitCode = await main(process.argv.slice(2));
}
catch (e) {
    console.error(`toolbox: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 2;
}
