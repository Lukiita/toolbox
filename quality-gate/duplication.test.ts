import { describe, expect, it } from 'vitest';

import { duplicationStats } from './duplication.mts';

function relatorio(percentage: number, clones: number) {
  return {
    statistics: { total: { clones, duplicatedLines: 132, percentage } },
  };
}

describe('duplicationStats', () => {
  it('extrai percentual e fragmentos', () => {
    expect(duplicationStats(relatorio(2.2, 95))).toEqual({
      percentual: 2.2,
      fragmentos: 95,
    });
  });

  it('arredonda para duas casas — sem isso, ruído de ponto flutuante reprovaria PR que não mexeu em duplicação', () => {
    expect(duplicationStats(relatorio(0.8849557522123894, 10)).percentual).toBe(0.88);
  });

  it('aceita repo sem duplicação nenhuma', () => {
    expect(duplicationStats(relatorio(0, 0))).toEqual({
      percentual: 0,
      fragmentos: 0,
    });
  });
});
