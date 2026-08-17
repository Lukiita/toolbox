// Duplicação de código, medida pelo jscpd.
//
// Vale a métrica porque copiar-colar é o atalho natural de um agente que já
// tem o trecho parecido no contexto — e é o tipo de piora que passa por lint,
// typecheck e teste sem acender nada.

/** O recorte do `jscpd-report.json` que interessa. */
export interface JscpdReport {
  statistics: {
    total: {
      clones: number;
      duplicatedLines: number;
      percentage: number;
    };
  };
}

export interface DuplicationStats {
  /** Percentual de linhas duplicadas, com duas casas. */
  percentual: number;
  /** Quantidade de fragmentos clonados. */
  fragmentos: number;
}

export function duplicationStats(report: JscpdReport): DuplicationStats {
  const total = report.statistics.total;
  return {
    // Duas casas porque a catraca compara número: sem arredondar, ruído de
    // ponto flutuante reprovaria PR que não mexeu em duplicação nenhuma.
    percentual: Math.round(total.percentage * 100) / 100,
    fragmentos: total.clones,
  };
}
