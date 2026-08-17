// Regra de lugar. O AGENTS.md diz onde a regra de negócio mora: `src/domain/`
// (e o caso de uso que a orquestra, em `src/application/`), como código puro
// com teste unitário ao lado. Este coletor acha o caso oposto: arquivo `.ts`
// em qualquer outro lugar de `src/` **com teste ao lado** — a assinatura de
// regra pura morando na borda, porque ninguém escreve teste unitário para
// fiação de UI ou para um repositório do Supabase.
//
// Por que a métrica existe: no projeto de origem, uma revisão por modelo que
// custou US$ 2,72 respondeu "nenhuma violação do CLAUDE.md" para um arquivo que
// era exatamente isto. Um grep não erra essa pergunta e não cansa.
//
// Aqui ela tem um peso a mais que lá: o ADR-003 já é verificado pelo ESLint na
// direção do import (`domain/` não importa nada). O que o ESLint NÃO vê é a
// regra que nunca chegou a `domain/` — nasceu direto no componente, sem import
// nenhum para violar. É esse buraco que este coletor cobre.

/** Onde a regra de negócio pode morar (ADR-003). */
const DIRETORIOS_DE_REGRA = ['src/domain/', 'src/application/'];

/**
 * Recebe caminhos relativos à raiz do repo (o que `git ls-files` devolve) e
 * devolve, ordenados, os que parecem regra pura fora dos diretórios de regra.
 *
 * Puro de propósito: a lista de arquivos pode vir do worktree ou de qualquer
 * commit (`git ls-tree -r <rev> --name-only`), o que torna a métrica
 * verificável contra o passado sem checkout.
 */
export function pureRuleFilesOutsideDomain(paths: readonly string[]): string[] {
  const todos = new Set(paths);
  return paths
    .filter(
      (p) =>
        p.startsWith('src/') &&
        !DIRETORIOS_DE_REGRA.some((dir) => p.startsWith(dir)) &&
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.endsWith('.d.ts') &&
        todos.has(`${p.slice(0, -3)}.test.ts`),
    )
    .sort();
}
