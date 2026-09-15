import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_QUALITY, type QualityConfig } from '../config/toolbox-config.mts';
import { type GateEnvironment, runQualityGate } from './run-gate.mts';

// A real repository in a temp dir: git, files, a baseline and a coverage json
// that istanbul would have written. jscpd runs for real (the package's own
// dependency); the test suite is skipped (`skipTests`) because the coverage
// json is the fixture. This is what `toolbox quality` does end to end, minus
// the process boundary.
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const TEMPLATE_BASELINE = resolve(
  import.meta.dirname,
  '../../templates/quality-gate/baseline.example.json',
);

function coverageJson(root: string, file: string, hits: number[]): string {
  const abs = join(root, file);
  const statementMap = Object.fromEntries(
    hits.map((_, i) => [String(i), { start: { line: i + 1 }, end: { line: i + 1 } }]),
  );
  const s = Object.fromEntries(hits.map((h, i) => [String(i), h]));
  return JSON.stringify({ [abs]: { statementMap, s } });
}

function scratchRepo(): { root: string; config: QualityConfig } {
  const root = mkdtempSync(join(tmpdir(), 'toolbox-gate-'));
  roots.push(root);
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  mkdirSync(join(root, 'src', 'billing', 'domain'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'billing', 'domain', 'fee.ts'),
    'export const fee = (x: number): number => (x > 0 ? x : 0);\n',
  );
  writeFileSync(
    join(root, 'src', 'billing', 'domain', 'fee.test.ts'),
    "import { fee } from './fee';\n",
  );
  mkdirSync(join(root, 'coverage-quality'));
  writeFileSync(
    join(root, 'coverage-quality', 'coverage-final.json'),
    coverageJson(root, 'src/billing/domain/fee.ts', [1]),
  );
  writeFileSync(join(root, 'quality-baseline.json'), readFileSync(TEMPLATE_BASELINE));
  git('add', '-A');
  git('commit', '-qm', 'init');
  return { root, config: { ...DEFAULT_QUALITY, vitestConfig: undefined } };
}

const env = (root: string, config: QualityConfig): GateEnvironment => ({
  root,
  config,
  warn: (): void => undefined,
});
const run = { updateBaseline: false, skipTests: true };

describe('runQualityGate (end to end on a temp repository)', () => {
  it('re-freezes: every measured metric gets an entry with a real value', () => {
    const { root, config } = scratchRepo();
    const result = runQualityGate(env(root, config), { ...run, updateBaseline: true });
    expect(result.status).toBe('refrozen');
    const written = JSON.parse(readFileSync(join(root, 'quality-baseline.json'), 'utf8'));
    expect(written.metrics['coverage-percent'].value).toBe(100);
    expect(written.metrics['files-over-limit'].value).toBe(0);
    expect(written.metrics['pure-rule-outside-domain'].value).toBe(0);
    expect(written.uncoveredByFile).toEqual({});
  });

  it('passes right after a re-freeze and produces a report with the marker', () => {
    const { root, config } = scratchRepo();
    runQualityGate(env(root, config), { ...run, updateBaseline: true });
    const result = runQualityGate(env(root, config), run);
    expect(result.status).toBe('passed');
    expect(result.failures).toEqual([]);
    expect(result.report).toContain('<!-- quality-gate -->');
  });

  it('fails when a file loses coverage after the freeze, naming the file', () => {
    const { root, config } = scratchRepo();
    runQualityGate(env(root, config), { ...run, updateBaseline: true });
    writeFileSync(
      join(root, 'coverage-quality', 'coverage-final.json'),
      coverageJson(root, 'src/billing/domain/fee.ts', [0]),
    );
    const result = runQualityGate(env(root, config), run);
    expect(result.status).toBe('failed');
    expect(result.failures.map((f) => f.metric)).toContain('src/billing/domain/fee.ts');
  });

  it('compares against the baseline of another rev and records its origin', () => {
    const { root, config } = scratchRepo();
    runQualityGate(env(root, config), { ...run, updateBaseline: true });
    execFileSync('git', ['commit', '-qam', 'freeze'], { cwd: root });
    const result = runQualityGate(env(root, config), { ...run, baselineFrom: 'HEAD' });
    expect(result.status).toBe('passed');
    expect(result.report).toContain('HEAD');
  });

  it('a base with no common history still yields a report (the re-freeze warning is just off)', () => {
    const { root, config } = scratchRepo();
    runQualityGate(env(root, config), { ...run, updateBaseline: true });
    execFileSync('git', ['commit', '-qam', 'freeze'], { cwd: root });
    const git = (...args: string[]): string =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
    git('checkout', '-q', '--orphan', 'unrelated');
    git('commit', '-qm', 'orphan with the same files');
    const orphan = git('rev-parse', 'HEAD').trim();
    git('checkout', '-q', branch);
    const result = runQualityGate(env(root, config), { ...run, baselineFrom: orphan });
    expect(result.status).toBe('passed');
    expect(result.report).toContain(orphan);
  });

  it('an unknown --baseline-from rev is an error, not a silent self-comparison', () => {
    const { root, config } = scratchRepo();
    runQualityGate(env(root, config), { ...run, updateBaseline: true });
    expect(() => runQualityGate(env(root, config), { ...run, baselineFrom: 'mian' })).toThrow(
      /--baseline-from mian: not a commit/,
    );
  });

  it('a malformed own baseline names the file, not just the JSON error', () => {
    const { root, config } = scratchRepo();
    writeFileSync(join(root, 'quality-baseline.json'), '{ not json');
    expect(() => runQualityGate(env(root, config), run)).toThrow(
      /quality-baseline\.json is not valid JSON/,
    );
  });

  it('a malformed baseline at the base rev fails instead of falling back to the own one', () => {
    const { root, config } = scratchRepo();
    writeFileSync(join(root, 'quality-baseline.json'), '{ not json');
    execFileSync('git', ['commit', '-qam', 'broken'], { cwd: root });
    // The worktree has a valid baseline again; only the committed one is broken.
    writeFileSync(join(root, 'quality-baseline.json'), readFileSync(TEMPLATE_BASELINE));
    expect(() => runQualityGate(env(root, config), { ...run, baselineFrom: 'HEAD' })).toThrow(
      /HEAD:quality-baseline\.json is not valid JSON/,
    );
  });

  it('a duplication path that does not exist is a setup error, not a 0% duplication', () => {
    const { root, config } = scratchRepo();
    expect(() =>
      runQualityGate(env(root, { ...config, duplicationPaths: ['apps/nope'] }), run),
    ).toThrow(/quality\.duplicationPaths: apps\/nope is not a folder/);
  });

  it('a tracked file deleted from the worktree but not staged does not crash the gate', () => {
    const { root, config } = scratchRepo();
    runQualityGate(env(root, config), { ...run, updateBaseline: true });
    rmSync(join(root, 'src', 'billing', 'domain', 'fee.ts'));
    expect(() => runQualityGate(env(root, config), run)).not.toThrow();
  });

  it('a missing coverage json names the path and the flag to drop', () => {
    const { root, config } = scratchRepo();
    rmSync(join(root, 'coverage-quality'), { recursive: true });
    expect(() => runQualityGate(env(root, config), run)).toThrow(
      /coverage report not found .*--skip-tests/,
    );
  });
});
