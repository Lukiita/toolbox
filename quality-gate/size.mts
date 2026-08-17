// Arquivos acima do limite de tamanho.
//
// Métrica preventiva, não corretiva: arquivo grande não quebra nada hoje, mas é
// onde a próxima mudança de agente vira bagunça — o vídeo que originou a
// catraca mostra um `app.js` de 4600 linhas crescendo 140 por PR. Aqui o maior
// tem 733, então a catraca congela um estado saudável.

/** Acima disto, o arquivo entra na contagem. */
export const LIMITE_DE_LINHAS = 400;

export interface ArquivoMedido {
  file: string;
  lines: number;
}

/**
 * Linhas de um arquivo, sem contar a quebra final como linha vazia extra —
 * `"a\nb\n".split("\n")` devolve 3 elementos para 2 linhas, e por causa disso
 * um arquivo de exatos 400 era medido como 401 e reprovava no limite.
 */
export function contarLinhas(conteudo: string): number {
  if (conteudo === '') return 0;
  return conteudo.replace(/\n$/, '').split('\n').length;
}

/**
 * Só código de produção sob `src/`: teste grande é normal (tabela de casos) e
 * cobrá-lo empurraria na direção errada, que é cortar caso de teste.
 */
export function isSizedFile(relPath: string): boolean {
  return (
    relPath.startsWith('src/') &&
    (relPath.endsWith('.ts') || relPath.endsWith('.tsx')) &&
    !relPath.endsWith('.test.ts') &&
    !relPath.endsWith('.test.tsx') &&
    !relPath.endsWith('.d.ts')
  );
}

/** Os que passaram do limite, do maior para o menor. */
export function oversizedFiles(
  medidos: readonly ArquivoMedido[],
  limite: number = LIMITE_DE_LINHAS,
): ArquivoMedido[] {
  return medidos
    .filter((m) => isSizedFile(m.file) && m.lines > limite)
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}
