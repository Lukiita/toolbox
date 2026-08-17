import { describe, expect, it } from 'vitest';

import { type Baseline, compareMetrics } from './compare.mts';

const BASE: Baseline = {
  metrics: {
    descobertas: {
      section: 'Cobertura',
      label: 'Descobertas',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 10,
    },
    cobertura: {
      section: 'Cobertura',
      label: 'Cobertura',
      mode: 'floor',
      direction: 'higher-is-better',
      value: 80,
    },
    informativa: {
      section: 'Cobertura',
      label: 'Informativa',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 1,
      gate: false,
    },
  },
  uncoveredByFile: {},
};

describe('compareMetrics', () => {
  it('aprova quando empata com o baseline', () => {
    expect(compareMetrics(BASE, { descobertas: 10, cobertura: 80 })).toEqual([]);
  });

  it('aprova quando melhora', () => {
    expect(compareMetrics(BASE, { descobertas: 4, cobertura: 95 })).toEqual([]);
  });

  it('reprova uma unidade de piora em lower-is-better', () => {
    const falhas = compareMetrics(BASE, { descobertas: 11 });
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toMatchObject({
      metric: 'descobertas',
      limite: 10,
      atual: 11,
    });
  });

  it('reprova ficar abaixo do piso em higher-is-better', () => {
    const falhas = compareMetrics(BASE, { cobertura: 79 });
    expect(falhas).toHaveLength(1);
    expect(falhas[0].message).toContain('piso');
  });

  it('chama de baseline no modo baseline e de piso no modo floor', () => {
    expect(compareMetrics(BASE, { descobertas: 11 })[0].message).toContain('baseline');
  });

  it('não reprova métrica marcada como só informativa', () => {
    expect(compareMetrics(BASE, { informativa: 999 })).toEqual([]);
  });

  it('reprova métrica ausente do baseline — portão não aprova o que não conhece', () => {
    const falhas = compareMetrics(BASE, { duplicacao: 3 });
    expect(falhas).toHaveLength(1);
    expect(falhas[0].message).toContain('--update-baseline');
  });
});
