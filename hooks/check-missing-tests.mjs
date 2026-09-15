#!/usr/bin/env node
/**
 * Reports changed source files that contain logic but have no co-located test.
 *
 * Single source of truth for the heuristic: the coding-agent `Stop` hook imports it
 * (warn, never block) and CI runs it as a CLI (blocks the pull request). If they diverged,
 * the agents and CI would disagree about what is required.
 *
 * Why this exists alongside coverage thresholds: thresholds are an aggregate and can be
 * diluted. A 50-line uncovered file added to 1000 covered lines still reports 95%, so it
 * passes a 90% gate while being entirely untested. This check is per file, so it cannot
 * be averaged away. (The quality ratchet's per-file map closes the same hole from the
 * coverage side; this one fires earlier — at Stop and at the PR — and needs no test run.)
 *
 * Usage in CI:  node node_modules/@lukiita/toolbox/hooks/check-missing-tests.mjs --base <sha> --head <sha>
 * With no arguments, compares the working tree against HEAD.
 *
 * What it watches comes from the project's `toolbox.config.ts` (`hooks.watchedPatterns`,
 * `hooks.exemptSuffixes`); with no config file, the canonical defaults apply.
 *
 * Exits 1 when something is missing, 0 otherwise.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { hooksConfigOrDefaults, isEntrypoint, repoRoot } from './hook-context.mjs';

const ROOT = repoRoot();

/**
 * Without a branch there is no alternate path to regress: a value object that only
 * wraps a field, a barrel file, a constant map. Requiring a test for those produces
 * ceremony, not confidence.
 */
const BRANCH_MARKERS = [
  /\bif\s*\(/,
  /\bswitch\s*\(/,
  /\bcatch\s*\b/,
  /\?\?/,
  /&&/,
  /\|\|/,
  /\bfor\s*\(/,
  /\bwhile\s*\(/,
  /\?\s*[\w'"([]/,
  /\bthrow\b/,
];

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
}

function changedFiles({ base, head } = {}) {
  const output =
    base && head
      ? git(['diff', '--name-only', '--diff-filter=ACMR', base, head, '--'])
      : `${git(['diff', '--name-only', 'HEAD', '--'])}\n${git(['ls-files', '--others', '--exclude-standard'])}`;

  // `.mts`/`.cts` are production modules too; the ratchet's size window counts
  // them, so the test rule must see them as well (review, round 2).
  return [...new Set(output.split('\n'))]
    .map((line) => line.trim())
    .filter((line) => /\.(ts|mts|cts)$/.test(line));
}

function isWatched(file, { watchedPatterns, exemptSuffixes }) {
  if (!watchedPatterns.some((pattern) => pattern.test(file))) return false;
  if (exemptSuffixes.some((suffix) => file.endsWith(suffix))) return false;
  return path.basename(file) !== 'index.ts';
}

function hasBranching(absolute) {
  try {
    const contents = readFileSync(absolute, 'utf-8');
    return BRANCH_MARKERS.some((marker) => marker.test(contents));
  } catch {
    return false;
  }
}

function missingTest(file) {
  const absolute = path.join(ROOT, file);
  if (!existsSync(absolute)) return false;
  if (existsSync(absolute.replace(/\.(ts|mts|cts)$/, '.test.$1'))) return false;
  return hasBranching(absolute);
}

/**
 * Lists changed files that require a test and do not have one.
 *
 * @param {{base?: string, head?: string}} range Explicit comparison; omit to use the working tree.
 * @param {{watchedPatterns: RegExp[], exemptSuffixes: string[]}} [config] Omit to read toolbox.config.
 * @returns {Promise<string[]>} Paths relative to the repository root.
 */
export async function listFilesMissingTests(range = {}, config) {
  const resolved = config ?? (await hooksConfigOrDefaults());
  return changedFiles(range).filter((file) => isWatched(file, resolved) && missingTest(file));
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const pending = await listFilesMissingTests({ base: flag('--base'), head: flag('--head') });
  if (pending.length === 0) {
    console.log('Every changed file with logic has a co-located test.');
    return;
  }

  console.error(`\n${pending.length} file(s) with logic and no co-located .test.ts:\n`);
  pending.forEach((file) => console.error(`  • ${file}`));
  console.error(
    '\nAGENTS.md requires the test to arrive in the same step as the code: cover the happy ' +
      'path and the domain exceptions.\n' +
      'Coverage thresholds will not catch this — an uncovered file dilutes into the average ' +
      'and still passes.\n' +
      'If one of these is genuinely exempt (no branching, pure pass-through), the honest fix ' +
      'is to move the logic somewhere it can be tested.\n',
  );
  process.exitCode = 1;
}

if (isEntrypoint(import.meta.url)) await main();
