// O relatório em markdown — a mesma coisa que sai no terminal, no sumário do
// job e no comentário do PR.
//
// Puro de propósito: relatório é o que a pessoa lê para decidir, então ele tem
// teste. E o marcador HTML no topo é o que permite ao CI **editar** o mesmo
// comentário a cada push em vez de empilhar um por commit.

import type { Baseline, Failure } from './compare.mts';

export const MARCADOR = '<!-- portao-de-qualidade -->';

export interface DetalheDoRelatorio {
  titulo: string;
  itens: string[];
}

export interface ReportInput {
  baseline: Baseline;
  atual: Record<string, number>;
  falhas: readonly Failure[];
  detalhes?: readonly DetalheDoRelatorio[];
  geradoEm: string;
  /** De onde veio o baseline: `origin/main` no CI, o worktree no local. */
  origemDoBaseline?: string;
  /** O PR mexeu no `quality-baseline.json` — precisa de olho humano. */
  baselineAlterado?: boolean;
}

function delta(valor: number, base: number, unit?: string): string {
  const d = Math.round((valor - base) * 100) / 100;
  if (d === 0) return '—';
  return `${d > 0 ? '+' : ''}${d}${unit ?? ''}`;
}

export function buildReport(input: ReportInput): string {
  const { baseline, atual, falhas, geradoEm } = input;
  const linhas: string[] = [MARCADOR, '', '## Portão de qualidade', ''];

  linhas.push(
    falhas.length === 0
      ? '**Status:** ✅ Aprovado'
      : `**Status:** ❌ Reprovado — ${falhas.length} regressão(ões)`,
    '',
  );

  if (input.baselineAlterado) {
    linhas.push(
      '> ⚠️ Este PR altera o `quality-baseline.json`. Recongelar é legítimo, mas é',
      '> decisão — confira o motivo no corpo do commit antes de aprovar.',
      '',
    );
  }

  // Uma tabela por seção, na ordem em que as métricas aparecem no baseline.
  const secoes: string[] = [];
  for (const m of Object.values(baseline.metrics)) {
    if (!secoes.includes(m.section)) secoes.push(m.section);
  }

  for (const secao of secoes) {
    linhas.push(`### ${secao}`, '');
    linhas.push('| Métrica | Baseline | Atual | Δ |', '| --- | ---: | ---: | ---: |');
    for (const [nome, m] of Object.entries(baseline.metrics)) {
      if (m.section !== secao) continue;
      const valor = atual[nome];
      if (valor === undefined) continue;
      const u = m.unit ?? '';
      linhas.push(`| ${m.label} | ${m.value}${u} | ${valor}${u} | ${delta(valor, m.value, u)} |`);
    }
    linhas.push('');
  }

  if (falhas.length > 0) {
    linhas.push('### Regressões', '');
    for (const f of falhas) linhas.push(`- ${f.message}`);
    linhas.push('');
    linhas.push(
      'A catraca só anda num sentido. Se a piora for deliberada, recongele com',
      '`pnpm quality --update-baseline` e explique o motivo no corpo do commit.',
      '',
    );
  }

  for (const d of input.detalhes ?? []) {
    if (d.itens.length === 0) continue;
    linhas.push(`<details><summary>${d.titulo}</summary>`, '');
    for (const item of d.itens) linhas.push(`- ${item}`);
    linhas.push('', '</details>', '');
  }

  const origem = input.origemDoBaseline ? ` · baseline de \`${input.origemDoBaseline}\`` : '';
  linhas.push(`<sub>Gerado por \`scripts/quality/gate.mts\` em ${geradoEm}${origem}</sub>`);
  return linhas.join('\n');
}
