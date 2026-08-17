// Files over the size limit.
//
// A preventive metric, not a corrective one: a big file breaks nothing today,
// but it is where the next agent edit turns into a mess - the video that
// originated the ratchet shows an `app.js` of 4600 lines growing 140 per PR.
// The AGENTS.md target is files under 500 lines (ideally 200-300); the limit
// here is the enforcement floor for that rule.

/** Above this, the file enters the count. */
export const LINE_LIMIT = 400;

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
 * Production code under `src/` only: a big test file is normal (a case
 * table), and charging for it would push in the wrong direction - cutting
 * test cases.
 */
export function isSizedFile(relPath: string): boolean {
  return (
    relPath.startsWith('src/') &&
    (relPath.endsWith('.ts') || relPath.endsWith('.tsx')) &&
    !relPath.endsWith('.test.ts') &&
    !relPath.endsWith('.test.tsx') &&
    !relPath.endsWith('.d.ts')
  );
}

/** The ones past the limit, largest first. */
export function oversizedFiles(
  measured: readonly MeasuredFile[],
  limit: number = LINE_LIMIT,
): MeasuredFile[] {
  return measured
    .filter((m) => isSizedFile(m.file) && m.lines > limit)
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}
