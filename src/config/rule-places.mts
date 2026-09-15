// Where business rules live, as patterns built from the project's feature
// slot. One source for two consumers that must agree: the ratchet's place
// rule (a tested file outside these is a displaced rule) and the
// missing-tests hook (a file inside these must have a test). Kept in the
// config layer because both read the same `quality.featureSlot`.

export interface RulePlacePatterns {
  domain: RegExp;
  application: RegExp;
}

/**
 * @example
 *   rulePlacePatterns('^src/(?:([^/]+)/)?').domain.test('src/billing/domain/x.ts') // true
 */
export function rulePlacePatterns(featureSlot: string): RulePlacePatterns {
  return {
    domain: new RegExp(`${featureSlot}domain/`),
    application: new RegExp(`${featureSlot}application/`),
  };
}
