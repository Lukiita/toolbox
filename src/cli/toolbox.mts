#!/usr/bin/env node
// `toolbox` - the command line of the package.
//
//   toolbox quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]
//   toolbox pre-push        (git's pre-push stdin; install as .husky/pre-push)
//   toolbox install [--write-conflicts]
//                           (copies the shipped skills into .agents/skills/, ADR-0003)
//   toolbox skills [--diff] (which skills the project edited, which are behind the package)
//
// Exit codes: 0 ok, 1 the ratchet failed, 2 usage error - whoever reads a CI
// log needs to tell the last two apart.
//
// Ships built (`dist/`, committed): Node refuses to strip types under
// node_modules, and pnpm 12 refuses a git dependency's build script unless the
// consumer allowlists it per commit - so nothing runs on install (ADR-0001).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadToolboxConfig } from '../config/load-config.mts';
import type { ResolvedToolboxConfig } from '../config/toolbox-config.mts';
import { inspectSkills, skillDiffs } from '../install/application/inspect-skills.mts';
import { installSkills } from '../install/application/install-skills.mts';
import { gitFileDiff } from '../install/infra/git-file-diff.mts';
import { GitPastReleases, repositoryCloneUrl } from '../install/infra/git-past-releases.mts';
import { gitTextMerge } from '../install/infra/git-text-merge.mts';
import { inspectionLines, installLine } from '../install/presentation/skill-report-lines.mts';
import { decidePrePush, parsePushedRefs, type PrePushPorts } from '../pre-push/pre-push.mts';
import { type GateOptions, parseArgs, UsageError } from '../quality-gate/args.mts';
import { runQualityGate } from '../quality-gate/run-gate.mts';
import * as git from './git-ports.mts';

const USAGE =
  'Usage: toolbox quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]\n' +
  '       (--update-baseline re-freezes and exits; --baseline-from and --out are ignored with it)\n' +
  '       toolbox pre-push\n' +
  '       toolbox install [--write-conflicts]\n' +
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

function install(root: string, args: string[]): number {
  assertKnownFlags(args, ['--write-conflicts']);
  const { version, repository } = packageManifest();
  const reports = installSkills({
    packageDir: PACKAGE_DIR,
    projectRoot: root,
    version,
    writeConflicts: args.includes('--write-conflicts'),
    mergeText: gitTextMerge,
    // The original of an edited skill comes from the tag of the release it
    // was copied from, in the package's own repository (ADR-0003).
    pastReleases: new GitPastReleases(repositoryCloneUrl(repository)),
  });
  for (const report of reports) console.log(installLine(report));
  return 0;
}

function skills(root: string, args: string[]): number {
  assertKnownFlags(args, ['--diff']);
  const inspections = inspectSkills({
    packageDir: PACKAGE_DIR,
    projectRoot: root,
    version: packageManifest().version,
  });
  for (const inspection of inspections) {
    for (const line of inspectionLines(inspection)) console.log(line);
    if (args.includes('--diff'))
      for (const diff of skillDiffs(inspection, gitFileDiff)) console.log(diff);
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
  console.error(e instanceof UsageError ? `${message}\n${USAGE}` : `toolbox: ${message}`);
  process.exitCode = 2;
}
