import { describe, expect, it } from 'vitest';

import { pureRuleFilesOutsideDomain } from './place-rule.mts';

describe('pureRuleFilesOutsideDomain', () => {
  it('acusa .ts com teste ao lado dentro de src/components', () => {
    // O caso que o ESLint do ADR-003 não pega: a regra nunca chegou a
    // `domain/`, então não há import de fronteira para violar.
    const files = [
      'src/components/calculo-emolumentos.ts',
      'src/components/calculo-emolumentos.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/components/calculo-emolumentos.ts']);
  });

  it('ignora .ts sem teste ao lado — é fiação, não regra deslocada', () => {
    const files = ['src/components/sicoex-lancador-props.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('ignora o que já está em src/domain', () => {
    const files = ['src/domain/rateio-frete-seguro.ts', 'src/domain/rateio-frete-seguro.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('ignora o que já está em src/application', () => {
    const files = [
      'src/application/gerar-declaracao.ts',
      'src/application/gerar-declaracao.test.ts',
    ];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('acusa regra pura em src/utils, que é borda tanto quanto a UI', () => {
    const files = ['src/utils/dinheiro.ts', 'src/utils/dinheiro.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual(['src/utils/dinheiro.ts']);
  });

  it('ignora componente .tsx: o AGENTS.md manda extrair a lógica, não testar o render', () => {
    const files = ['src/components/AsycudaEditor.tsx', 'src/components/AsycudaEditor.test.tsx'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('ignora o que está fora de src/', () => {
    const files = ['scripts/quality/size.mts', 'scripts/quality/size.test.ts'];
    expect(pureRuleFilesOutsideDomain(files)).toEqual([]);
  });

  it('devolve ordenado, para o diff do baseline ser estável', () => {
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
