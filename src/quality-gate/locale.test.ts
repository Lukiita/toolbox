import { describe, expect, it } from 'vitest';

import { stringsFor } from './locale.mts';

describe('stringsFor', () => {
  it('both languages expose exactly the same keys', () => {
    expect(Object.keys(stringsFor('pt')).sort()).toEqual(Object.keys(stringsFor('en')).sort());
  });

  it('every key has the same shape in both languages', () => {
    const en = stringsFor('en') as unknown as Record<string, unknown>;
    const pt = stringsFor('pt') as unknown as Record<string, unknown>;
    for (const key of Object.keys(en)) {
      expect(typeof pt[key], key).toBe(typeof en[key]);
    }
  });

  it('falls back to English for absent or unknown language', () => {
    expect(stringsFor(undefined)).toBe(stringsFor('en'));
    expect(stringsFor('fr')).toBe(stringsFor('en'));
  });

  it('interpolates values into messages', () => {
    const t = stringsFor('en');
    expect(t.metricRegressed('Coverage', '86%', '84%', 'baseline')).toBe(
      'Coverage went from 86% to 84% (baseline)',
    );
    expect(stringsFor('pt').fileRegressed('src/a.ts', 3, 5)).toBe(
      '`src/a.ts` passou de 3 para 5 linhas descobertas',
    );
  });
});
