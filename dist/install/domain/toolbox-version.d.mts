declare const releaseNumber: unique symbol;
/** `<major>.<minor>.<patch>`, with an optional pre-release tail; only `parseReleaseNumber` makes one. */
export type ReleaseNumber = string & {
    readonly [releaseNumber]: true;
};
export declare class ReleaseNumberError extends Error {
}
/**
 * Whether a value is a release number. The manifest asks this to word its own error.
 *
 * @example
 *   isReleaseNumber('1.2.0') // => true
 */
export declare function isReleaseNumber(value: unknown): value is ReleaseNumber;
/**
 * A release number from wherever it was read; `source` names that place in the error.
 *
 * @example
 *   parseReleaseNumber(packageJson.version, 'package.json "version"') // => '2.0.0'
 */
export declare function parseReleaseNumber(value: unknown, source?: string): ReleaseNumber;
/**
 * Numeric comparison of the three release numbers; a pre-release tail is ignored.
 *
 * @example
 *   isOlderVersion(parseReleaseNumber('1.9.0'), parseReleaseNumber('1.10.0')) // => true
 */
export declare function isOlderVersion(version: ReleaseNumber, than: ReleaseNumber): boolean;
export {};
