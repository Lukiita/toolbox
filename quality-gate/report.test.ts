import { describe, expect, it } from 'vitest';

import type { Baseline } from './compare.mts';
import { buildReport, MARCADOR } from './report.mts';

const BASE: Baseline = {
  metrics: {
    'linhas-descobertas': {
      section: 'Cobertura',
      label: 'Linhas descobertas',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 799,
      gate: false,
    },
    'duplicacao-percentual': {
      section: 'Duplicação',
      label: 'Percentual duplicado',
      mode: 'baseline',
      direction: 'lower-is-better',
      value: 2.2,
      unit: '%',
    },
  },
  uncoveredByFile: {},
};

const ENTRADA = {
  baseline: BASE,
  atual: { 'linhas-descobertas': 799, 'duplicacao-percentual': 2.2 },
  falhas: [],
  geradoEm: '2026-08-05T12:00:00.000Z',
};

describe('buildReport', () => {
  it('abre com o marcador, que é o que deixa o CI editar o mesmo comentário', () => {
    expect(buildReport(ENTRADA).startsWith(MARCADOR)).toBe(true);
  });

  it('diz aprovado quando não há falha', () => {
    expect(buildReport(ENTRADA)).toContain('**Status:** ✅ Aprovado');
  });

  it('diz reprovado e conta as regressões', () => {
    const md = buildReport({
      ...ENTRADA,
      falhas: [
        { metric: 'a', limite: 208, atual: 213, message: '`a` subiu' },
        { metric: 'b', limite: 2, atual: 3, message: '`b` subiu' },
      ],
    });
    expect(md).toContain('❌ Reprovado — 2 regressão(ões)');
    expect(md).toContain('### Regressões');
    expect(md).toContain('- `a` subiu');
  });

  it('agrupa uma tabela por seção', () => {
    const md = buildReport(ENTRADA);
    expect(md).toContain('### Cobertura');
    expect(md).toContain('### Duplicação');
  });

  it('mostra Δ com sinal e sufixo, e travessão quando não mudou', () => {
    const md = buildReport({
      ...ENTRADA,
      atual: { 'linhas-descobertas': 812, 'duplicacao-percentual': 2.2 },
    });
    expect(md).toContain('| Linhas descobertas | 799 | 812 | +13 |');
    expect(md).toContain('| Percentual duplicado | 2.2% | 2.2% | — |');
  });

  it('mostra Δ negativo quando melhora', () => {
    const md = buildReport({
      ...ENTRADA,
      atual: { 'linhas-descobertas': 780, 'duplicacao-percentual': 2.04 },
    });
    expect(md).toContain('| Linhas descobertas | 799 | 780 | -19 |');
    expect(md).toContain('-0.16%');
  });

  it('avisa quando o PR mexe no próprio baseline', () => {
    const md = buildReport({ ...ENTRADA, baselineAlterado: true });
    expect(md).toContain('altera o `quality-baseline.json`');
  });

  it('registra de onde veio o baseline no rodapé', () => {
    const md = buildReport({ ...ENTRADA, origemDoBaseline: 'origin/main' });
    expect(md).toContain('baseline de `origin/main`');
    expect(md).toContain('2026-08-05T12:00:00.000Z');
  });

  it('omite detalhe vazio em vez de imprimir seção oca', () => {
    const md = buildReport({
      ...ENTRADA,
      detalhes: [{ titulo: 'Nada aqui', itens: [] }],
    });
    expect(md).not.toContain('Nada aqui');
  });
});
