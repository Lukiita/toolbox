// Leitura da linha de comando do portão.
//
// Vive fora do `main()` porque é a única parte dele que decide alguma coisa —
// o resto é encanamento (spawn, ler arquivo, imprimir). Extraída, ela ganha
// teste; embutida, só o olho humano garantia que `--baseline-from` sem valor
// não vira `undefined` silencioso.

export interface OpcoesDoPortao {
  /** Recongela os números em vez de comparar. */
  atualizar: boolean;
  /** Reaproveita o `coverage/` já gerado. */
  pularTestes: boolean;
  /** Commit de onde ler o baseline (o CI passa a base do PR). */
  baselineDe?: string;
  /** Arquivo onde gravar o relatório. */
  destino?: string;
}

/** Erro de uso — separado de "a catraca reprovou", que é `exit 1`. */
export class ErroDeUso extends Error {}

/**
 * Flag com valor presente e sem valor **estoura**, em vez de devolver
 * `undefined`. Devolver `undefined` seria pior do que parece nos dois casos:
 *
 * - `--baseline-from` sem valor faz o portão comparar com o baseline da
 *   própria branch, sem avisar (o aviso do fallback só dispara quando há um
 *   rev que falhou), e o CI aprovaria uma regressão contra o baseline errado;
 * - `--out` sem valor não grava o relatório, e o passo do comentário no PR
 *   simplesmente não acontece — some sem barulho.
 *
 * Flag ausente continua devolvendo `undefined`: isso é escolha, não engano.
 */
function valorDe(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const valor = args[i + 1];
  if (valor === undefined || valor === '' || valor.startsWith('--')) {
    const recebido = valor === undefined ? 'nada' : `"${valor}"`;
    throw new ErroDeUso(`${flag} exige um valor (recebeu ${recebido}).`);
  }
  return valor;
}

export function parseArgs(args: readonly string[]): OpcoesDoPortao {
  return {
    atualizar: args.includes('--update-baseline'),
    pularTestes: args.includes('--skip-tests'),
    baselineDe: valorDe(args, '--baseline-from'),
    destino: valorDe(args, '--out'),
  };
}
