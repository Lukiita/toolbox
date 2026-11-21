#!/usr/bin/env node
// `toolbox` - the command line of the package.
//
//   toolbox quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]
//   toolbox pre-push        (git's pre-push stdin; install as .husky/pre-push)
//   toolbox install [--all] [--write-conflicts] [<skill>...]
//                           (copies the skills the project picks into .agents/skills/
//                            and brings the ones it has up to date, ADR-0003)
//   toolbox skills [--diff] (which skills the project edited, which are behind the package)
//
// Exit codes: 0 ok, 1 the ratchet failed or a skill could not be installed,
// 2 usage error - whoever reads a CI log needs to tell the last two apart -
// and 130 when the skill picker was closed without confirming.
//
// Ships built (`dist/`, committed): Node refuses to strip types under
// node_modules, and pnpm 12 refuses a git dependency's build script unless the
// consumer allowlists it per commit - so nothing runs on install (ADR-0001).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadToolboxConfig } from "../config/load-config.mjs";
import { availableLine, DiskSkillFolders, gitFileDiff, GitPastReleases, gitTextMerge, inspectionLines, inspectSkills, installLine, installSkills, needsSelection, parseInstallArguments, parseReleaseNumber, parseSkillsArguments, repositoryCloneUrl, selectionRequiredLines, skillCatalog, SkillCommandUsageError, skillDiffs, } from "../install/index.mjs";
import { decidePrePush, parsePushedRefs } from "../pre-push/pre-push.mjs";
import { parseArgs, UsageError } from "../quality-gate/args.mjs";
import { runQualityGate } from "../quality-gate/run-gate.mjs";
import * as git from "./git-ports.mjs";
import { pickSkills } from "./pick-skills.mjs";
const USAGE = 'Usage: toolbox quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]\n' +
    '       (--update-baseline re-freezes and exits; --baseline-from and --out are ignored with it)\n' +
    '       toolbox pre-push\n' +
    '       toolbox install [--all] [--write-conflicts] [<skill>...]\n' +
    '       toolbox skills [--diff]';
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
// The package that is running: its `skills/` is what gets copied and its
// version is what gets recorded - whether it runs from the project's
// node_modules or from a `pnpm dlx` / `npx` cache, in a repository with no
// package.json of its own (ADR-0003).
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// The running package's own package.json. Its version is parsed here, where
// it enters: a bad one fails once, naming the field, instead of every skill
// reporting `failed` (found in review).
function packageManifest() {
    const json = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));
    return {
        version: parseReleaseNumber(json.version, 'package.json "version"'),
        repository: json.repository,
    };
}
function skillFolders(root) {
    return new DiskSkillFolders({ packageDir: PACKAGE_DIR, projectRoot: root });
}
/** The person closed the picker without confirming: nothing is installed, exit 130 like Ctrl+C. */
class Cancelled extends Error {
}
// A terminal gets the picker; a script or an agent is told what to type.
async function askWhichSkills(folders, version) {
    const catalog = skillCatalog(folders);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new SkillCommandUsageError(selectionRequiredLines(catalog, version).join('\n'));
    }
    const picked = await pickSkills(catalog, version);
    if (!picked)
        throw new Cancelled();
    return picked;
}
async function install(root, args) {
    const request = parseInstallArguments(args);
    const { version, repository } = packageManifest();
    const folders = skillFolders(root);
    const available = [];
    const reports = installSkills({
        folders,
        version,
        select: needsSelection(request, folders) ? await askWhichSkills(folders, version) : request,
        writeConflicts: request.writeConflicts,
        mergeText: gitTextMerge,
        // The original of an edited skill comes from the tag of the release it
        // was copied from, in the package's own repository (ADR-0003).
        pastReleases: new GitPastReleases(repositoryCloneUrl(repository)),
        // Printed skill by skill: a run that stops early has already said what it
        // wrote. The skills the project did not pick go in one line, at the end.
        onReport: (report) => {
            if (report.status === 'available')
                available.push(report.name);
            else
                console.log(installLine(report));
        },
    });
    if (available.length > 0)
        console.log(availableLine(available));
    return reports.some((report) => report.status === 'failed') ? 1 : 0;
}
function printInspection(inspection, withDiffs) {
    for (const line of inspectionLines(inspection))
        console.log(line);
    if (!withDiffs)
        return;
    for (const diff of skillDiffs(inspection, gitFileDiff))
        console.log(diff);
}
function skills(root, args) {
    const { diff } = parseSkillsArguments(args);
    const inspections = inspectSkills({
        folders: skillFolders(root),
        version: packageManifest().version,
    });
    for (const inspection of inspections)
        printInspection(inspection, diff);
    // Like `install`: every skill is listed, and one that could not be read
    // makes the command exit 1, so a script notices.
    return inspections.some((inspection) => inspection.local === 'unreadable') ? 1 : 0;
}
// `install` and `skills` never read the config: a project with no
// toolbox.config.ts (or a typo in it) still gets its skills (found in review).
const COMMANDS = new Map([
    ['install', install],
    ['skills', skills],
    ['quality', async (root, args) => quality(root, await loadToolboxConfig(root), args)],
    ['pre-push', async (root) => prePush(root, await loadToolboxConfig(root))],
]);
async function main(argv) {
    const [command, ...rest] = argv;
    const run = COMMANDS.get(command ?? '');
    if (!run) {
        console.error(`unknown command: ${command ?? '(none)'}\n${USAGE}`);
        return 2;
    }
    return run(git.repoRoot(process.cwd()), rest);
}
// A setup error (bad config, missing baseline or coverage json, jscpd not
// found) is not "the ratchet failed": it exits 2 with its own message, so a
// CI log never reads a config typo as a quality regression.
// What to say, and which code to leave with, for a command that did not finish.
function failure(e) {
    // Closed without confirming: the picker already said so on its last line.
    if (e instanceof Cancelled)
        return { message: '', exitCode: 130 };
    const message = e instanceof Error ? e.message : String(e);
    const usage = e instanceof UsageError || e instanceof SkillCommandUsageError;
    return { message: usage ? `${message}\n${USAGE}` : `toolbox: ${message}`, exitCode: 2 };
}
try {
    process.exitCode = await main(process.argv.slice(2));
}
catch (e) {
    const { message, exitCode } = failure(e);
    if (message !== '')
        console.error(message);
    process.exitCode = exitCode;
}
