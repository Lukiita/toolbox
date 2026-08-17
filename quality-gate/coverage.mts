// Uncovered lines in testable files.
//
// "Testable" here is `src/**/*.ts` without `.tsx`: React components have no
// test infrastructure in this repo, and charging coverage for them would
// produce a permanently red gate - which is the same as no gate.
//
// Why the metric is an absolute count and not a percentage: the case it must
// catch is the `actions.ts` from PR #44, where name/slug validation was born
// inside the server action with no test. A per-file percentage misses it -
// the file was at 0% and stayed at 0%. A count of uncovered lines goes up
// when someone adds a rule at the edge and down when someone moves the rule
// into the lib, which is exactly the desired gradient.

/** The slice of `coverage-final.json` (istanbul format) that matters here. */
export interface CoverageEntry {
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  s: Record<string, number>;
}

export type CoverageMap = Record<string, CoverageEntry>;

/**
 * A line counts as covered when **some** statement on it ran. A line with a
 * statement and no execution counts as uncovered; a line with no statement
 * (comment, lone brace, type) counts for neither side.
 */
function classifyLines(entry: CoverageEntry): {
  instrumented: Set<number>;
  covered: Set<number>;
} {
  const instrumented = new Set<number>();
  const covered = new Set<number>();
  for (const [id, loc] of Object.entries(entry.statementMap)) {
    // A multi-line statement counts by its first line: where the defect is read.
    const line = loc.start.line;
    instrumented.add(line);
    if ((entry.s[id] ?? 0) > 0) covered.add(line);
  }
  return { instrumented, covered };
}

export function uncoveredLines(entry: CoverageEntry): number[] {
  const { instrumented, covered } = classifyLines(entry);
  return [...instrumented].filter((l) => !covered.has(l)).sort((a, b) => a - b);
}

/** Instrumented lines and how many ran - the numerator and the denominator. */
export function lineTotals(entry: CoverageEntry): {
  total: number;
  covered: number;
} {
  const { instrumented, covered } = classifyLines(entry);
  return { total: instrumented.size, covered: covered.size };
}

/** `true` for the files this repo can cover with a unit test. */
export function isTestableFile(relPath: string): boolean {
  return (
    relPath.startsWith('src/') &&
    relPath.endsWith('.ts') &&
    !relPath.endsWith('.test.ts') &&
    !relPath.endsWith('.d.ts')
  );
}

export interface UncoveredByFile {
  file: string;
  lines: number[];
  /** The file's own covered percentage, for reading in the report. */
  percent: number;
}

function percent(covered: number, total: number): number {
  // A file with no statements at all counts as 100%: there is nothing to
  // cover, and returning 0 would drag the average down for an empty file.
  if (total === 0) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

/**
 * Repo line coverage over testable files only - the number everyone expects
 * to see. It pairs with the per-file map, never replaces it: the percentage
 * catches **dilution** (deleting well-tested code makes no file worse but
 * drops the average), and the map catches local regressions, which the
 * percentage dilutes as the repo grows.
 */
export function coveragePercent(
  map: CoverageMap,
  toRelativePath: (absolute: string) => string,
): number {
  let total = 0;
  let covered = 0;
  for (const [absolute, entry] of Object.entries(map)) {
    if (!isTestableFile(toRelativePath(absolute))) continue;
    const totals = lineTotals(entry);
    total += totals.total;
    covered += totals.covered;
  }
  return percent(covered, total);
}

/**
 * Walks the whole map and returns, per testable file, the uncovered lines -
 * sorted by count, which is the order someone fixes them in.
 */
export function uncoveredInTestableFiles(
  map: CoverageMap,
  toRelativePath: (absolute: string) => string,
): UncoveredByFile[] {
  const out: UncoveredByFile[] = [];
  for (const [absolute, entry] of Object.entries(map)) {
    const file = toRelativePath(absolute);
    if (!isTestableFile(file)) continue;
    const lines = uncoveredLines(entry);
    if (lines.length === 0) continue;
    const totals = lineTotals(entry);
    out.push({ file, lines, percent: percent(totals.covered, totals.total) });
  }
  return out.sort((a, b) => b.lines.length - a.lines.length || a.file.localeCompare(b.file));
}
