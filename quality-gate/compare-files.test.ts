import { describe, expect, it } from 'vitest';

import { compareFileCounts } from './compare.mts';

const BASE = { 'src/app/app/actions.ts': 208, 'src/lib/server/booking.ts': 106 };

describe('compareFileCounts', () => {
  it('aprova quando o arquivo empata', () => {
    expect(compareFileCounts(BASE, BASE)).toEqual([]);
  });

  it('aprova quando o arquivo melhora', () => {
    const falhas = compareFileCounts(BASE, {
      ...BASE,
      'src/app/app/actions.ts': 200,
    });
    expect(falhas).toEqual([]);
  });

  it('reprova piora local mesmo com o total do repo caindo', () => {
    // O caso medido em e6d4144: actions.ts 208 → 213 enquanto o repo ia de
    // 799 para 792. É a razão de a métrica ser por arquivo.
    const falhas = compareFileCounts(BASE, {
      'src/app/app/actions.ts': 213,
      'src/lib/server/booking.ts': 90,
    });
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toMatchObject({ limite: 208, atual: 213 });
    expect(falhas[0].message).toContain('src/app/app/actions.ts');
  });

  it('trata arquivo novo como baseline zero', () => {
    const falhas = compareFileCounts(BASE, { 'src/lib/novo.ts': 3 });
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toMatchObject({ limite: 0, atual: 3 });
  });

  it('ignora arquivo que sumiu do relatório', () => {
    expect(compareFileCounts(BASE, {})).toEqual([]);
  });

  it('ordena pela maior piora, que é a ordem de conserto', () => {
    const falhas = compareFileCounts(BASE, {
      'src/app/app/actions.ts': 210,
      'src/lib/novo.ts': 30,
    });
    expect(falhas.map((f) => f.atual - f.limite)).toEqual([30, 2]);
  });
});
