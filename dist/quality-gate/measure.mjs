// Collects every metric of one run: the numbers for the baseline comparison
// and the lists the report details. Reads the repo (git, files, coverage
// json, jscpd) once; everything after this is pure.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { explicitAnyCount, filesWithAny } from "./any-count.mjs";
import { functionComplexities, overComplexFunctions, } from "./complexity.mjs";
import { coveragePercent, uncoveredInTestableFiles, } from "./coverage.mjs";
import { circularDependencies, importGraph } from "./cycles.mjs";
import { duplicationStats } from "./duplication.mjs";
import { runGit } from "./git.mjs";
import { pureRuleFilesOutsideDomain } from "./place-rule.mjs";
import { countLines, isSizedFile, oversizedFiles } from "./size.mjs";
// `--others --exclude-standard` on top of `--cached`: a new file not yet
// committed must count. The tlc per-task gate runs BEFORE the commit, and
// without this the place rule would miss exactly the file just born in the
// wrong place - the hole sat at the most valuable integration point.
/**
 * Every versioned file plus the untracked ones git does not ignore.
 *
 * @example
 *   projectFiles(root) // => ['src/a.ts', 'src/a.test.ts', ...]
 */
export function projectFiles(root) {
    return runGit(root, ['ls-files', '--cached', '--others', '--exclude-standard'])
        .split('\n')
        .filter(Boolean);
}
// The binary directly, not `pnpm vitest`: pnpm checks the lockfile against
// node_modules before executing, and that blocks running the gate over a
// worktree of another commit - which is exactly how it was calibrated.
// `--config`: the ratchet's own config measures the wide slice with no
// threshold (see templates/quality-gate/vitest.quality.config.ts); a project
// whose default config already does that sets `vitestConfig: undefined`.
function runCoveredTests(root, vitestConfig) {
    const args = ['run', '--coverage', ...(vitestConfig ? ['--config', vitestConfig] : [])];
    execFileSync(resolve(root, 'node_modules/.bin/vitest'), args, { cwd: root, stdio: 'inherit' });
}
function readCoverage(root, config) {
    const path = resolve(root, config.coveragePath);
    if (!existsSync(path)) {
        throw new Error(`coverage report not found at ${path}: run without --skip-tests, or point quality.coveragePath at the json your vitest config writes`);
    }
    const scope = {
        toRelativePath: (absolute) => relative(root, absolute).split('\\').join('/'),
        sourceWindow: config.sourceWindow,
    };
    const map = JSON.parse(readFileSync(path, 'utf8'));
    return { uncovered: uncoveredInTestableFiles(map, scope), percent: coveragePercent(map, scope) };
}
// Every production source read once, shared by the size, any, complexity and
// cycle collectors - four collectors re-opening the same files was the kind
// of duplication AGENTS.md tells the agents off for.
//
// Regular files only: `git ls-files` also lists submodules and symlinks.
// Reading a directory throws EISDIR, and a link to a device (`/dev/zero`)
// never finishes - `lstatSync` does not follow the link, so it decides
// before opening.
function readProductionSources(root, paths, sourceWindow) {
    const sources = new Map();
    for (const file of paths.filter((p) => isSizedFile(p, sourceWindow))) {
        if (!lstatSync(resolve(root, file)).isFile())
            continue;
        sources.set(file, readFileSync(resolve(root, file), 'utf8'));
    }
    return sources;
}
// jscpd is the toolbox's own dependency, resolved from here - not from the
// project's node_modules, which does not have it once the copy is gone. It is
// pinned EXACTLY in package.json: 5.2.1 found 100 fragments where 5.0.14 found
// 95 on the same tree, a false regression - the instrument must not change
// under the number; a bump is a deliberate toolbox change with a re-freeze. Since
// 5.x the package is a launcher for a native binary: no `main`, so the module
// itself cannot be resolved, but `package.json` can (no `exports` map), and
// `bin` names the launcher.
function jscpdBin() {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('jscpd/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.jscpd;
    if (!bin)
        throw new Error(`jscpd's package.json at ${pkgPath} declares no "jscpd" bin`);
    return resolve(dirname(pkgPath), bin);
}
// jscpd exits 0 with an empty report for a path that does not exist - or is
// a file, not a folder - and the metric would freeze at 0 forever: a monorepo
// that re-anchored `sourceWindow` but not `duplicationPaths` (review rounds 2
// and loop 2).
function assertDuplicationFolders(root, paths) {
    const isFolder = (p) => existsSync(resolve(root, p)) && statSync(resolve(root, p)).isDirectory();
    const bad = paths.filter((p) => !isFolder(p));
    if (bad.length === 0)
        return;
    throw new Error(`quality.duplicationPaths: ${bad.join(', ')} is not a folder under ${root}; point it at the production source folders`);
}
function measureDuplication(root, paths) {
    assertDuplicationFolders(root, paths);
    const out = mkdtempSync(resolve(tmpdir(), 'jscpd-'));
    try {
        execFileSync(process.execPath, [jscpdBin(), '--reporters', 'json', '--output', out, '--silent', ...paths], { cwd: root, stdio: 'ignore' });
        const report = JSON.parse(readFileSync(resolve(out, 'jscpd-report.json'), 'utf8'));
        return duplicationStats(report);
    }
    finally {
        // Without this, every run leaves a directory behind - and in the tlc
        // per-task gate that is 20 per feature.
        rmSync(out, { recursive: true, force: true });
    }
}
/** Everything that comes from reading the sources - no test run, no coverage. */
function measureSources(root, config, versioned) {
    const sources = readProductionSources(root, versioned, config.sourceWindow);
    const measured = [...sources].map(([file, source]) => ({ file, source }));
    return {
        displacedRules: pureRuleFilesOutsideDomain(versioned, config),
        oversized: oversizedFiles(measured.map(({ file, source }) => ({ file, lines: countLines(source) })), { limit: config.lineLimit, sourceWindow: config.sourceWindow }),
        anys: filesWithAny(measured.map(({ file, source }) => ({ file, count: explicitAnyCount(file, source) }))),
        complexFns: overComplexFunctions(measured.flatMap(({ file, source }) => functionComplexities(file, source)), config.ccLimit),
        cycles: circularDependencies(importGraph(sources, config.aliasPrefixes)),
    };
}
function metricValues(m, duplication, uncovered, percent) {
    return {
        'coverage-percent': percent,
        'uncovered-lines': uncovered.reduce((s, f) => s + f.lines.length, 0),
        'files-with-uncovered-lines': uncovered.length,
        'duplication-percent': duplication.percent,
        'duplication-fragments': duplication.fragments,
        'pure-rule-outside-domain': m.displacedRules.length,
        'circular-dependencies': m.cycles.length,
        'files-over-limit': m.oversized.length,
        'cc-over-limit': m.complexFns.length,
        'explicit-any': m.anys.reduce((s, f) => s + f.count, 0),
    };
}
/**
 * Measures the repository at `root` with the project's config.
 *
 * @example
 *   const { current } = measureRepository({ root, config, skipTests: true });
 *   current['files-over-limit'] // => 3
 */
export function measureRepository({ root, config, skipTests }) {
    const sourceMetrics = measureSources(root, config, projectFiles(root));
    const duplication = measureDuplication(root, config.duplicationPaths);
    if (!skipTests)
        runCoveredTests(root, config.vitestConfig);
    const { uncovered, percent } = readCoverage(root, config);
    const byFile = {};
    for (const { file, lines } of uncovered)
        byFile[file] = lines.length;
    return {
        ...sourceMetrics,
        uncovered,
        byFile,
        current: metricValues(sourceMetrics, duplication, uncovered, percent),
    };
}
