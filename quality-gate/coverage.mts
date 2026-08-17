// Linhas não cobertas em arquivo testável.
//
// "Testável" aqui é `src/**/*.ts` sem `.tsx`: componente React não tem
// infraestrutura de teste neste repo, e cobrar cobertura dele produziria um
// portão permanentemente vermelho — que é o mesmo que portão nenhum.
//
// Por que a métrica é contagem absoluta e não percentual: o caso que ela
// precisa pegar é o `actions.ts` da PR #44, onde a validação de nome e slug
// nasceu dentro da server action sem teste. Percentual de arquivo não pega
// isso — o arquivo já estava em 0% e continuou em 0%. Contagem de linhas
// descobertas sobe quando alguém adiciona regra na borda e desce quando alguém
// move a regra para a lib, que é exatamente o gradiente desejado.

/** O recorte do `coverage-final.json` (formato istanbul) que interessa aqui. */
export interface CoverageEntry {
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  s: Record<string, number>;
}

export type CoverageMap = Record<string, CoverageEntry>;

/**
 * Uma linha conta como coberta se **alguma** instrução nela rodou. Linha com
 * instrução e nenhuma execução conta como descoberta; linha sem instrução
 * (comentário, chave solta, tipo) não conta para nenhum lado.
 */
function classificarLinhas(entry: CoverageEntry): {
  comInstrucao: Set<number>;
  cobertas: Set<number>;
} {
  const comInstrucao = new Set<number>();
  const cobertas = new Set<number>();
  for (const [id, local] of Object.entries(entry.statementMap)) {
    // Instrução multilinha conta pela primeira linha: é onde o defeito é lido.
    const linha = local.start.line;
    comInstrucao.add(linha);
    if ((entry.s[id] ?? 0) > 0) cobertas.add(linha);
  }
  return { comInstrucao, cobertas };
}

export function uncoveredLines(entry: CoverageEntry): number[] {
  const { comInstrucao, cobertas } = classificarLinhas(entry);
  return [...comInstrucao].filter((l) => !cobertas.has(l)).sort((a, b) => a - b);
}

/** Linhas com instrução e quantas rodaram — o numerador e o denominador. */
export function lineTotals(entry: CoverageEntry): {
  total: number;
  cobertas: number;
} {
  const { comInstrucao, cobertas } = classificarLinhas(entry);
  return { total: comInstrucao.size, cobertas: cobertas.size };
}

/** `true` para os arquivos que este repo consegue cobrir com teste unitário. */
export function isTestableFile(relPath: string): boolean {
  return (
    relPath.startsWith('src/') &&
    relPath.endsWith('.ts') &&
    !relPath.endsWith('.test.ts') &&
    !relPath.endsWith('.d.ts')
  );
}

export interface UncoveredByFile {
  file: string;
  lines: number[];
  /** Percentual coberto do próprio arquivo, para leitura no relatório. */
  percentual: number;
}

function percentual(cobertas: number, total: number): number {
  // Arquivo sem instrução nenhuma conta como 100%: não há o que cobrir, e
  // devolver 0 puxaria a média para baixo por um arquivo vazio.
  if (total === 0) return 100;
  return Math.round((cobertas / total) * 10000) / 100;
}

/**
 * Cobertura de linhas do repo, só sobre arquivo testável — o número que todo
 * mundo espera ver. Ele é o par do mapa por arquivo, não o substituto: o
 * percentual pega **diluição** (apagar código bem testado não faz nenhum
 * arquivo piorar, mas derruba a média), e o mapa pega piora local, que o
 * percentual dilui quando o repo cresce.
 */
export function coveragePercent(
  map: CoverageMap,
  paraCaminhoRelativo: (absoluto: string) => string,
): number {
  let total = 0;
  let cobertas = 0;
  for (const [absoluto, entry] of Object.entries(map)) {
    if (!isTestableFile(paraCaminhoRelativo(absoluto))) continue;
    const t = lineTotals(entry);
    total += t.total;
    cobertas += t.cobertas;
  }
  return percentual(cobertas, total);
}

/**
 * Percorre o mapa inteiro e devolve, por arquivo testável, as linhas
 * descobertas — ordenado por quantidade, que é a ordem em que alguém
 * conserta.
 */
export function uncoveredInTestableFiles(
  map: CoverageMap,
  paraCaminhoRelativo: (absoluto: string) => string,
): UncoveredByFile[] {
  const saida: UncoveredByFile[] = [];
  for (const [absoluto, entry] of Object.entries(map)) {
    const file = paraCaminhoRelativo(absoluto);
    if (!isTestableFile(file)) continue;
    const lines = uncoveredLines(entry);
    if (lines.length === 0) continue;
    const t = lineTotals(entry);
    saida.push({ file, lines, percentual: percentual(t.cobertas, t.total) });
  }
  return saida.sort((a, b) => b.lines.length - a.lines.length || a.file.localeCompare(b.file));
}
