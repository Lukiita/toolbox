// Comparação com o baseline — o coração da catraca.
//
// Dois modos, porque projeto novo e projeto existente precisam de coisas
// diferentes:
//
//   - `baseline`: congela o valor medido hoje e proíbe piorar. É o modo de
//     repo com passado — não se conserta tudo de uma vez, mas também não se
//     acrescenta mais nada.
//   - `floor`: exige um valor mínimo/máximo escolhido, independente do que
//     existe. É o modo de repo novo, onde não há passado para congelar e
//     "não piorar" seria vacuamente verdadeiro.
//
// A regra de ouro é a do vídeo que originou isto: um PR pode adicionar código,
// mas não pode piorar nenhuma métrica — nem por uma unidade.

export type Direction = 'lower-is-better' | 'higher-is-better';

export interface MetricBaseline {
  /** Agrupa a métrica na tabela do relatório. */
  section: string;
  /** Como a métrica aparece na coluna "Métrica". */
  label: string;
  mode: 'baseline' | 'floor';
  direction: Direction;
  value: number;
  /** Sufixo na tabela. Percentual compara com duas casas. */
  unit?: '%';
  /** `false` = aparece na tabela mas não reprova. */
  gate?: boolean;
  /** Só documental: o que o número significa e por que está nesse valor. */
  note?: string;
}

export interface Baseline {
  metrics: Record<string, MetricBaseline>;
  /** Catraca por arquivo: caminho relativo → linhas descobertas aceitas. */
  uncoveredByFile: Record<string, number>;
}

export interface Failure {
  metric: string;
  limite: number;
  atual: number;
  message: string;
}

function piorou(direction: Direction, limite: number, atual: number): boolean {
  return direction === 'lower-is-better' ? atual > limite : atual < limite;
}

/**
 * Catraca por arquivo. Existe porque o somatório global **não** serve: medido
 * em 2026-08-05 contra `e6d4144`, `actions.ts` subiu de 208 para 213 linhas
 * descobertas — a regressão que o CodeRabbit apontou — enquanto o total do repo
 * caía de 799 para 792, porque a mesma feature cobriu outras coisas. Um número
 * só deixa a piora local passar escondida atrás da melhora alheia.
 *
 * Arquivo ausente do baseline vale 0: código novo com linha descoberta é
 * exatamente o caso a pegar. Quando for deliberado, recongela.
 */
export function compareFileCounts(
  baseline: Record<string, number>,
  atual: Record<string, number>,
): Failure[] {
  const falhas: Failure[] = [];
  for (const [file, valor] of Object.entries(atual)) {
    const limite = baseline[file] ?? 0;
    if (valor <= limite) continue;
    falhas.push({
      metric: file,
      limite,
      atual: valor,
      message: `\`${file}\` passou de ${limite} para ${valor} linhas descobertas`,
    });
  }
  return falhas.sort((a, b) => b.atual - b.limite - (a.atual - a.limite));
}

/**
 * Devolve as métricas que regrediram. Métrica presente na medição e ausente do
 * baseline **falha**: baseline incompleto seria um portão que aprova o que não
 * conhece, e o conserto (rodar com `--update-baseline`) é uma linha.
 */
export function compareMetrics(baseline: Baseline, atual: Record<string, number>): Failure[] {
  const falhas: Failure[] = [];
  for (const [metric, valor] of Object.entries(atual)) {
    const esperado = baseline.metrics[metric];
    if (!esperado) {
      falhas.push({
        metric,
        limite: Number.NaN,
        atual: valor,
        message: `métrica \`${metric}\` não está no baseline — rode com \`--update-baseline\` para congelá-la`,
      });
      continue;
    }
    if (esperado.gate === false) continue;
    if (!piorou(esperado.direction, esperado.value, valor)) continue;
    const sufixo = esperado.unit ?? '';
    const rotulo = esperado.mode === 'floor' ? 'piso' : 'baseline';
    falhas.push({
      metric,
      limite: esperado.value,
      atual: valor,
      message: `${esperado.label} passou de ${esperado.value}${sufixo} para ${valor}${sufixo} (${rotulo})`,
    });
  }
  return falhas;
}
