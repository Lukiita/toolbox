// Release numbers of the toolbox, compared as numbers. The installer needs
// one question answered: "is the toolbox running older than the one that
// wrote this record?" - a teammate with a stale node_modules must not roll a
// project's skills back to what they still have installed (ADR-0003).
//
// A release number is its own type, made in one place: a plain string
// travelled through ten signatures, was checked when a record was written,
// checked again (by a throw) in the middle of a comparison, and the running
// version from package.json was never checked at all (found in review).
// Parsed once where it enters - the manifest, package.json - it is then
// known good everywhere, and comparing two of them cannot fail.

const RELEASE_NUMBERS = /^(\d+)\.(\d+)\.(\d+)/;

declare const releaseNumber: unique symbol;

/** `<major>.<minor>.<patch>`, with an optional pre-release tail; only `parseReleaseNumber` makes one. */
export type ReleaseNumber = string & { readonly [releaseNumber]: true };

export class ReleaseNumberError extends Error {}

/**
 * Whether a value is a release number. The manifest asks this to word its own error.
 *
 * @example
 *   isReleaseNumber('1.2.0') // => true
 */
export function isReleaseNumber(value: unknown): value is ReleaseNumber {
  return typeof value === 'string' && RELEASE_NUMBERS.test(value);
}

/**
 * A release number from wherever it was read; `source` names that place in the error.
 *
 * @example
 *   parseReleaseNumber(packageJson.version, 'package.json "version"') // => '2.0.0'
 */
export function parseReleaseNumber(value: unknown, source = 'toolbox version'): ReleaseNumber {
  if (isReleaseNumber(value)) return value;
  throw new ReleaseNumberError(
    `${source}: received ${JSON.stringify(value)}, expected "<major>.<minor>.<patch>"`,
  );
}

// Cannot miss: a ReleaseNumber matched the pattern when it was made.
function releaseNumbers(version: ReleaseNumber): number[] {
  return (RELEASE_NUMBERS.exec(version) as RegExpExecArray).slice(1).map(Number);
}

/**
 * Numeric comparison of the three release numbers; a pre-release tail is ignored.
 *
 * @example
 *   isOlderVersion(parseReleaseNumber('1.9.0'), parseReleaseNumber('1.10.0')) // => true
 */
export function isOlderVersion(version: ReleaseNumber, than: ReleaseNumber): boolean {
  const [mine, theirs] = [releaseNumbers(version), releaseNumbers(than)];
  const firstDifference = mine.findIndex((number, index) => number !== theirs[index]);
  return firstDifference !== -1 && mine[firstDifference] < theirs[firstDifference];
}
