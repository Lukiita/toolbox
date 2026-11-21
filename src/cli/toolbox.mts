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
// 2 usage error - whoever reads a CI log needs to tell the last two apart.
//
// Ships built (`dist/`, committed): Node refuses to strip types under
// node_modules, and pnpm 12 refuses a git dependency's build script unless the
// consumer allowlists it per commit - so nothing runs on install (ADR-0001).

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadToolboxConfig } from '../config/load-config.mts';
import type { ResolvedToolboxConfig } from '../config/toolbox-config.mts';
import {
  availableLine,
  DiskSkillFolders,
  gitFileDiff,
  GitPastReleases,
  gitTextMerge,
  hasInstalledSkills,
  inspectionLines,
  inspectSkills,
  installLine,
  installSkills,
  InstallUsageError,
  parseInstallArguments,
  parseSelection,
  repositoryCloneUrl,
  selectionMenu,
  skillCatalog,
  skillDiffs,
  type SkillSelection,
} from '../install/index.mts';
import { decidePrePush, parsePushedRefs, type PrePushPorts } from '../pre-push/pre-push.mts';
import { type GateOptions, parseArgs, UsageError } from '../quality-gate/args.mts';
import { runQualityGate } from '../quality-gate/run-gate.mts';
import * as git from './git-ports.mts';

const USAGE =
  'Usage: toolbox quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]\n' +
  '       (--update-baseline re-freezes and exits; --baseline-from and --out are ignored with it)\n' +
  '       toolbox pre-push\n' +
  '       toolbox install [--all] [--write-conflicts] [<skill>...]\n' +
  '       toolbox skills [--diff]';

function quality(root: string, config: ResolvedToolboxConfig, args: string[]): number {
  let options: GateOptions;
  try {
    options = parseArgs(args);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
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
  if (options.out) writeReport(resolve(process.cwd(), options.out), result.report ?? '');
  return result.status === 'failed' ? 1 : 0;
}

function writeReport(path: string, report: string): void {
  try {
    writeFileSync(path, `${report}\n`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`could not write the report to ${path} (${reason}); it was printed above`);
  }
}

function prePushPorts(root: string, config: ResolvedToolboxConfig): PrePushPorts {
  const reports = git.gitDir(root);
  return {
    baseTip: () => git.baseTip(root, config.quality.baseBranch),
    mergeBase: (a, b) => git.mergeBase(root, a, b),
    hasCommit: (sha) => git.hasCommit(root, sha),
    touchesCode: (from, to) => git.touchesCode(root, from, to),
    baselineChanged: (from, to) => git.baselineChanged(root, from, to),
    gate: (baselineFrom) => {
      const out = join(reports, baselineFrom ? 'quality-pre-push.md' : 'quality-pre-push-own.md');
      const result = runQualityGate(
        { root, config: config.quality, warn: console.error },
        { updateBaseline: false, skipTests: config.quality.prePushSkipTests, baselineFrom },
      );
      writeReport(out, result.report ?? '');
      return { passed: result.status === 'passed', failures: result.failures, reportPath: out };
    },
  };
}

function prePush(root: string, config: ResolvedToolboxConfig): number {
  const refs = parsePushedRefs(readFileSync(0, 'utf8'));
  const decision = decidePrePush(
    refs,
    git.headSha(root),
    config.quality.baseBranch,
    prePushPorts(root, config),
  );
  for (const line of decision.lines) console.log(line);
  return decision.exitCode;
}

// The package that is running: its `skills/` is what gets copied and its
// version is what gets recorded - whether it runs from the project's
// node_modules or from a `pnpm dlx` / `npx` cache, in a repository with no
// package.json of its own (ADR-0003).
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface PackageManifest {
  version: string;
  repository: unknown;
}

function packageManifest(): PackageManifest {
  return JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as PackageManifest;
}

// A mistyped flag fails instead of being ignored: `--write-conflict` read as
// "no flag" would leave the conflict unwritten and say nothing.
function assertKnownFlags(args: readonly string[], known: readonly string[]): void {
  const unknown = args.find((arg) => !known.includes(arg));
  if (unknown !== undefined) throw new UsageError(`unknown argument: ${unknown}`);
}

function skillFolders(root: string): DiskSkillFolders {
  return new DiskSkillFolders({ packageDir: PACKAGE_DIR, projectRoot: root });
}

// A terminal is asked; a script or an agent is told what to type. Guessing
// "all of them" for either would undo the point of picking.
async function askWhichSkills(folders: DiskSkillFolders, version: string): Promise<SkillSelection> {
  const catalog = skillCatalog(folders);
  const menu = selectionMenu(catalog, version);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new UsageError(
      `this project has no skill from the toolbox yet: name the ones it gets, or pass --all.\n${menu.slice(0, -1).join('\n')}`,
    );
  }
  for (const line of menu) console.log(line);
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return parseSelection(
      await terminal.question('> '),
      catalog.map((entry) => entry.name),
    );
  } finally {
    terminal.close();
  }
}

// Names or --all on the command line, or a project that already has skills:
// the selection is settled. Only a project starting from nothing is asked.
async function selectionFor(
  request: SkillSelection,
  folders: DiskSkillFolders,
  version: string,
): Promise<SkillSelection> {
  const settled = request.all || request.names.length > 0 || hasInstalledSkills(folders);
  return settled ? request : askWhichSkills(folders, version);
}

async function install(root: string, args: string[]): Promise<number> {
  const request = parseInstallArguments(args);
  const { version, repository } = packageManifest();
  const folders = skillFolders(root);
  const available: string[] = [];
  const reports = installSkills({
    folders,
    version,
    select: await selectionFor(request, folders, version),
    writeConflicts: request.writeConflicts,
    mergeText: gitTextMerge,
    // The original of an edited skill comes from the tag of the release it
    // was copied from, in the package's own repository (ADR-0003).
    pastReleases: new GitPastReleases(repositoryCloneUrl(repository)),
    // Printed skill by skill: a run that stops early has already said what it
    // wrote. The skills the project did not pick go in one line, at the end.
    onReport: (report) => {
      if (report.status === 'available') available.push(report.name);
      else console.log(installLine(report));
    },
  });
  if (available.length > 0) console.log(availableLine(available));
  return reports.some((report) => report.status === 'failed') ? 1 : 0;
}

function skills(root: string, args: string[]): number {
  assertKnownFlags(args, ['--diff']);
  const inspections = inspectSkills({
    folders: skillFolders(root),
    version: packageManifest().version,
  });
  for (const inspection of inspections) {
    for (const line of inspectionLines(inspection)) console.log(line);
    if (args.includes('--diff')) {
      for (const diff of skillDiffs(inspection, gitFileDiff)) console.log(diff);
    }
  }
  return 0;
}

type Command = (root: string, args: string[]) => number | Promise<number>;

// `install` and `skills` never read the config: a project with no
// toolbox.config.ts (or a typo in it) still gets its skills (found in review).
const COMMANDS = new Map<string, Command>([
  ['install', install],
  ['skills', skills],
  ['quality', async (root, args) => quality(root, await loadToolboxConfig(root), args)],
  ['pre-push', async (root) => prePush(root, await loadToolboxConfig(root))],
]);

async function main(argv: string[]): Promise<number> {
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
try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  const usage = e instanceof UsageError || e instanceof InstallUsageError;
  console.error(usage ? `${message}\n${USAGE}` : `toolbox: ${message}`);
  process.exitCode = 2;
}
