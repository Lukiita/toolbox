export interface RulePlacePatterns {
    domain: RegExp;
    application: RegExp;
}
/**
 * @example
 *   rulePlacePatterns('^src/(?:([^/]+)/)?').domain.test('src/billing/domain/x.ts') // true
 */
export declare function rulePlacePatterns(featureSlot: string): RulePlacePatterns;
