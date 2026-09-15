// Files over the size limit.
//
// A preventive metric, not a corrective one: a big file breaks nothing today,
// but it is where the next agent edit turns into a mess - the video that
// originated the ratchet shows an `app.js` of 4600 lines growing 140 per PR.
// The AGENTS.md target is files under 500 lines (ideally 200-300); the limit
// here is the enforcement floor for that rule.

import { DEFAULT_QUALITY } from '../config/toolbox-config.mts';

export interface MeasuredFile {
  file: string;
  lines: number;
}

/**
 * Lines of a file, without counting the final newline as an extra empty
 * line - `"a\nb\n".split("\n")` returns 3 elements for 2 lines, and because
 * of that a file of exactly 400 was measured as 401 and failed at the limit.
 */
export function countLines(content: string): number {
  if (content === '') return 0;
  return content.replace(/\n$/, '').split('\n').length;
}

/**
 * Production code inside the source window only (`^src/` by default,
 * `quality.sourceWindow` in the config): a big test file is normal (a case
 * table), and charging for it would push in the wrong direction - cutting
 * test cases.
 */
const PRODUCTION_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const EXCLUDED_SUFFIXES = [
  '.test.ts',
  '.test.tsx',
  '.test.mts',
  '.test.cts',
  '.d.ts',
  '.d.mts',
  '.d.cts',
];

/**
 * `.mts` and `.cts` are here because they were NOT, and a production module written in one was
 * invisible to every metric at once: 534 lines at cyclomatic complexity 60, `any`-typed and
 * uncovered, moved not a single number (review 2026-09-02, round 8, demonstrated). TypeScript
 * compiles them like any other module; the gate has to see them like any other module.
 */
export function isSizedFile(
  relPath: string,
  sourceWindow: RegExp = DEFAULT_QUALITY.sourceWindow,
): boolean {
  if (!sourceWindow.test(relPath)) return false;
  if (EXCLUDED_SUFFIXES.some((suffix) => relPath.endsWith(suffix))) return false;
  return PRODUCTION_EXTENSIONS.some((extension) => relPath.endsWith(extension));
}

export interface SizeOptions {
  /** `quality.lineLimit`, default 400. */
  limit?: number;
  /** `quality.sourceWindow`, default `^src/`. */
  sourceWindow?: RegExp;
}

/** The ones past the limit, largest first. */
export function oversizedFiles(
  measured: readonly MeasuredFile[],
  {
    limit = DEFAULT_QUALITY.lineLimit,
    sourceWindow = DEFAULT_QUALITY.sourceWindow,
  }: SizeOptions = {},
): MeasuredFile[] {
  return measured
    .filter((m) => isSizedFile(m.file, sourceWindow) && m.lines > limit)
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}
