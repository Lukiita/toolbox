import { describe, expect, it } from 'vitest';

import { pureRuleFilesOutsideDomain } from './place-rule.mts';

describe('pureRuleFilesOutsideDomain', () => {
  it('flags a .ts with a test beside it inside src/components', () => {
    // The case import-direction lint cannot catch: the rule never reached
    // `domain/`, so there is no boundary import to violate.
    const files = [
      'src/components/fee-calculation.ts',
      'src/components/fee-calculation.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/components/fee-calculation.ts']);
  });

  it('ignores a .ts with no test beside it - wiring, not a displaced rule', () => {
    const files = ['src/components/launcher-props.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts the package-by-layer layout: src/domain and src/application', () => {
    const files = [
      'src/domain/freight-split.ts',
      'src/domain/freight-split.test.ts',
      'src/application/generate-declaration.ts',
      'src/application/generate-declaration.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('accepts the package-by-feature layout: the layers live inside the feature folder', () => {
    const files = [
      'src/processo-aduaneiro/domain/rateio.ts',
      'src/processo-aduaneiro/domain/rateio.test.ts',
      'src/processo-aduaneiro/application/gerar-declaracao.ts',
      'src/processo-aduaneiro/application/gerar-declaracao.test.ts',
      'src/shared/domain/money.ts',
      'src/shared/domain/money.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('flags a rule inside a feature folder but outside its layer dirs', () => {
    const files = [
      'src/processo-aduaneiro/calculo-emolumentos.ts',
      'src/processo-aduaneiro/calculo-emolumentos.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([
      'src/processo-aduaneiro/calculo-emolumentos.ts',
    ]);
  });

  it('flags a pure rule in src/utils, which is as much an edge as the UI', () => {
    const files = ['src/utils/money.ts', 'src/utils/money.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/utils/money.ts']);
  });

  it('ignores .tsx components: AGENTS.md says to extract the logic, not to test the render', () => {
    const files = ['src/components/AsycudaEditor.tsx', 'src/components/AsycudaEditor.test.tsx'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('ignores what lives outside src/', () => {
    const files = ['scripts/quality/size.mts', 'scripts/quality/size.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('returns sorted, so the baseline diff stays stable', () => {
    const files = [
      'src/components/z.ts',
      'src/components/z.test.ts',
      'src/components/a.ts',
      'src/components/a.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([
      'src/components/a.ts',
      'src/components/z.ts',
    ]);
  });
});
