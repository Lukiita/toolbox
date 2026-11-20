// Release numbers of the toolbox, compared as numbers. The installer needs
// one question answered: "is the toolbox running older than the one that
// wrote this record?" - a teammate with a stale node_modules must not roll a
// project's skills back to what they still have installed (ADR-0003).
const RELEASE_NUMBERS = /^(\d+)\.(\d+)\.(\d+)/;
/**
 * Whether a string starts with `<major>.<minor>.<patch>`.
 *
 * @example
 *   isReleaseNumber('1.2.0') // => true
 */
export function isReleaseNumber(version) {
    return typeof version === 'string' && RELEASE_NUMBERS.test(version);
}
function releaseNumbers(version) {
    const match = RELEASE_NUMBERS.exec(version);
    if (match)
        return match.slice(1).map(Number);
    throw new Error(`toolbox version: received ${JSON.stringify(version)}, expected "<major>.<minor>.<patch>"`);
}
/**
 * Numeric comparison of the three release numbers; a pre-release tail is ignored.
 *
 * @example
 *   isOlderVersion('1.9.0', '1.10.0') // => true
 */
export function isOlderVersion(version, than) {
    const [mine, theirs] = [releaseNumbers(version), releaseNumbers(than)];
    const firstDifference = mine.findIndex((number, index) => number !== theirs[index]);
    return firstDifference !== -1 && mine[firstDifference] < theirs[firstDifference];
}
