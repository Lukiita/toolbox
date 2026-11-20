/**
 * Whether a string starts with `<major>.<minor>.<patch>`.
 *
 * @example
 *   isReleaseNumber('1.2.0') // => true
 */
export declare function isReleaseNumber(version: unknown): version is string;
/**
 * Numeric comparison of the three release numbers; a pre-release tail is ignored.
 *
 * @example
 *   isOlderVersion('1.9.0', '1.10.0') // => true
 */
export declare function isOlderVersion(version: string, than: string): boolean;
