// Quality gate - the frozen-baseline ratchet.
//
// Runs as `pnpm quality`. Collects deterministic metrics, compares them with
// `quality-baseline.json` and exits non-zero when any of them got worse. Zero
// model cost: the same class as the Archon bash nodes, which cost US$ 0.00 in
// a US$ 21.92 run.
//
// Options:
//   --update-baseline        re-freezes the numbers (deliberate, versioned action)
//   --skip-tests             reuses the already-generated coverage report
//   --baseline-from <rev>    reads the baseline from another commit (CI uses the
//                            PR base, otherwise a re-freezing PR approves itself)
//   --out <file>             writes the report to a markdown file
//
// Node 24 runs TypeScript directly (type stripping), so this file needs no
// build step and still goes through `tsc --noEmit` with the rest of the repo.
//
// The report language is per project: `"language": "en" | "pt"` in the
// baseline json (see locale.mts). Console output stays English.

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';

import { explicitAnyCount, type FileAnyCount, filesWithAny, isAnyCheckedFile } from './any-count.mts';
import { parseArgs, UsageError } from './args.mts';
import {
  type Baseline,
  compareFileCounts,
  compareMetrics,
  type MetricBaseline,
} from './compare.mts';
import {
  type CoverageMap,
  coveragePercent,
  type UncoveredByFile,
  uncoveredInTestableFiles,
} from './coverage.mts';
import { duplicationStats, type JscpdReport } from './duplication.mts';
import { stringsFor } from './locale.mts';
import { pureRuleFilesOutsideDomain, RULE_DIRECTORIES } from './place-rule.mts';
import { buildReport, type ReportDetail } from './report.mts';
import {
  countLines,
  isSizedFile,
  LINE_LIMIT,
  type MeasuredFile,
  oversizedFiles,
} from './size.mts';

const ROOT = resolve(import.meta.dirname, '../..');
const BASELINE_PATH = resolve(ROOT, 'quality-baseline.json');
// The ratchet's own directory - see `reportsDirectory` in
// vitest.quality.config.ts: sharing `coverage/` with `pnpm test:coverage`
// made each one erase the other's report.
const COVERAGE_PATH = resolve(ROOT, 'coverage-quality/coverage-final.json');

// Metadata for each metric, so `--update-baseline` can CREATE an entry that
// does not exist in the json yet. Without this, the compare failure message
// ("run with --update-baseline to freeze it") was a false promise: the update
// only touched entries already present, and adopting a new metric meant
// editing the baseline by hand. Existing entries keep owning their own
// metadata - the defaults apply only at birth.
const METRIC_DEFAULTS: Record<string, Omit<MetricBaseline, 'value'>> = {
  'coverage-percent': {
    section: 'Coverage',
    label: 'Line coverage',
    mode: 'baseline',
    direction: 'higher-is-better',
    unit: '%',
  },
  'uncovered-lines': {
    section: 'Coverage',
    label: 'Uncovered lines',
    mode: 'baseline',
    direction: 'lower-is-better',
    gate: false,
  },
  'files-with-uncovered-lines': {
    section: 'Coverage',
    label: 'Files with uncovered lines',
    mode: 'baseline',
    direction: 'lower-is-better',
    gate: false,
  },
  'duplication-percent': {
    section: 'Duplication',
    label: 'Duplicated lines',
    mode: 'baseline',
    direction: 'lower-is-better',
    unit: '%',
  },
  'duplication-fragments': {
    section: 'Duplication',
    label: 'Duplicated fragments',
    mode: 'baseline',
    direction: 'lower-is-better',
  },
  'pure-rule-outside-domain': {
    section: 'Architecture',
    label: 'Pure rules outside the domain',
    mode: 'baseline',
    direction: 'lower-is-better',
  },
  'files-over-limit': {
    section: 'Size',
    label: 'Files over the line limit',
    mode: 'baseline',
    direction: 'lower-is-better',
  },
  'explicit-any': {
    section: 'Types',
    label: 'Explicit `any`',
    mode: 'baseline',
    direction: 'lower-is-better',
    note: 'AST count of any-keyword nodes in production files (any-count.mts). AGENTS.md bans new `any`; the ratchet lets legacy debt only shrink.',
  },
};

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

// `--others --exclude-standard` on top of `--cached`: a new file not yet
// committed must count. The tlc per-task gate runs BEFORE the commit, and
// without this the place rule would miss exactly the file just born in the
// wrong place - the hole sat at the most valuable integration point.
function projectFiles(): string[] {
  return git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
}

// The binary directly, not `pnpm vitest`: pnpm checks the lockfile against
// node_modules before executing, and that blocks running the gate over a
// worktree of another commit - which is exactly how it was calibrated.
//
// `--config vitest.quality.config.ts`: the default config measures only the
// strict slice with its own thresholds; the ratchet needs the wide slice with
// no threshold. The why of the split lives in that file.
function runCoveredTests(): void {
  execFileSync(
    resolve(ROOT, 'node_modules/.bin/vitest'),
    ['run', '--coverage', '--config', 'vitest.quality.config.ts'],
    { cwd: ROOT, stdio: 'inherit' },
  );
}

const toRelative = (absolute: string) => relative(ROOT, absolute).split('\\').join('/');

function readCoverage(): {
  uncovered: UncoveredByFile[];
  percent: number;
} {
  const map = JSON.parse(readFileSync(COVERAGE_PATH, 'utf8')) as CoverageMap;
  return {
    uncovered: uncoveredInTestableFiles(map, toRelative),
    percent: coveragePercent(map, toRelative),
  };
}

// Regular files only: `git ls-files` also lists submodules and symlinks.
// Reading a directory throws EISDIR, and a link to a device (`/dev/zero`)
// never finishes - `lstatSync` does not follow the link, so it decides
// before opening.
function regularFiles(paths: readonly string[]): string[] {
  return paths.filter((file) => lstatSync(resolve(ROOT, file)).isFile());
}

function measureSizes(paths: readonly string[]): MeasuredFile[] {
  return regularFiles(paths.filter(isSizedFile)).map((file) => ({
    file,
    lines: countLines(readFileSync(resolve(ROOT, file), 'utf8')),
  }));
}

function measureAnys(paths: readonly string[]): FileAnyCount[] {
  return filesWithAny(
    regularFiles(paths.filter(isAnyCheckedFile)).map((file) => ({
      file,
      count: explicitAnyCount(file, readFileSync(resolve(ROOT, file), 'utf8')),
    })),
  );
}

function measureDuplication() {
  const out = mkdtempSync(resolve(tmpdir(), 'jscpd-'));
  try {
    execFileSync(
      resolve(ROOT, 'node_modules/.bin/jscpd'),
      ['--reporters', 'json', '--output', out, '--silent', 'src'],
      { cwd: ROOT, stdio: 'ignore' },
    );
    const report = JSON.parse(readFileSync(resolve(out, 'jscpd-report.json'), 'utf8')) as JscpdReport;
    return duplicationStats(report);
  } finally {
    // Without this, every run leaves a directory behind - and in the tlc
    // per-task gate that is 20 per feature.
    rmSync(out, { recursive: true, force: true });
  }
}

function readBaseline(rev?: string): { base: Baseline; origin?: string } {
  if (!rev) return { base: JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) };
  try {
    return {
      base: JSON.parse(git('show', `${rev}:quality-baseline.json`)),
      origin: rev,
    };
  } catch {
    // The base has no baseline yet - the PR that introduces the ratchet.
    // Falling back to the branch's own is the only possible behavior, and
    // printing the reason keeps anyone from reading "passed" believing the
    // base was compared.
    console.error(
      `warning: ${rev} has no quality-baseline.json (the PR that introduces the ratchet).\n` +
        "Comparing against the branch's own baseline.",
    );
    return { base: JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) };
  }
}

function main(): void {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    // Exit 2, not 1: a usage error is not the same as "the ratchet failed",
    // and whoever reads the CI log needs to tell the two apart.
    console.error(
      `${e.message}\nUsage: pnpm quality [--update-baseline] [--skip-tests] [--baseline-from <rev>] [--out <file>]`,
    );
    process.exit(2);
  }
  const { updateBaseline, skipTests, baselineFrom, out } = options;

  const versioned = projectFiles();
  const displacedRules = pureRuleFilesOutsideDomain(versioned);
  const oversized = oversizedFiles(measureSizes(versioned));
  const anys = measureAnys(versioned);
  const duplication = measureDuplication();

  if (!skipTests) runCoveredTests();
  const { uncovered, percent: coveragePercentValue } = readCoverage();
  const byFile: Record<string, number> = {};
  for (const { file, lines } of uncovered) byFile[file] = lines.length;

  const current: Record<string, number> = {
    'coverage-percent': coveragePercentValue,
    'uncovered-lines': uncovered.reduce((s, f) => s + f.lines.length, 0),
    'files-with-uncovered-lines': uncovered.length,
    'duplication-percent': duplication.percent,
    'duplication-fragments': duplication.fragments,
    'pure-rule-outside-domain': displacedRules.length,
    'files-over-limit': oversized.length,
    'explicit-any': anys.reduce((s, f) => s + f.count, 0),
  };

  if (updateBaseline) {
    const { base } = readBaseline();
    // Rebuilt from what was measured: an existing entry keeps its metadata, a
    // new one is born from the registered defaults, and a metric no longer
    // measured is pruned - stale entries would document a gate that no longer
    // exists. Re-freezing is already the deliberate, versioned action.
    const next: Record<string, MetricBaseline> = {};
    for (const [name, value] of Object.entries(current)) {
      const meta = base.metrics[name] ?? METRIC_DEFAULTS[name];
      if (meta) next[name] = { ...meta, value };
    }
    base.metrics = next;
    base.uncoveredByFile = Object.fromEntries(
      Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(BASELINE_PATH, `${JSON.stringify(base, null, 2)}\n`);
    console.log('baseline re-frozen in quality-baseline.json');
    return;
  }

  const { base, origin } = readBaseline(baselineFrom);
  const t = stringsFor(base.language);
  const failures = [
    ...compareMetrics(base, current, t),
    ...compareFileCounts(base.uncoveredByFile ?? {}, byFile, t),
  ];

  const ruleDirs = RULE_DIRECTORIES.map((d) => `\`${d}\``).join(' / ');
  const details: ReportDetail[] = [
    {
      title: t.pureRulesTitle(displacedRules.length, ruleDirs),
      items: displacedRules.map((f) => `\`${f}\``),
    },
    {
      title: t.filesOverLimitTitle(LINE_LIMIT, oversized.length),
      items: oversized.map((g) => `\`${g.file}\` — ${g.lines}`),
    },
    {
      title: t.explicitAnyTitle(anys.length),
      items: anys.slice(0, 20).map((a) => `\`${a.file}\` — ${a.count}`),
    },
    {
      title: t.uncoveredFilesTitle(uncovered.length),
      items: uncovered.slice(0, 20).map((d) => t.uncoveredFileItem(d.file, d.lines.length, d.percent)),
    },
  ];

  const report = buildReport(
    {
      baseline: base,
      current,
      failures,
      details,
      generatedAt: new Date().toISOString(),
      baselineOrigin: origin,
      baselineChanged: origin
        ? git('diff', '--name-only', `${origin}...HEAD`).includes('quality-baseline.json')
        : false,
    },
    t,
  );

  console.log(report);
  if (out) writeFileSync(resolve(ROOT, out), `${report}\n`);
  if (failures.length > 0) process.exit(1);
}

main();
