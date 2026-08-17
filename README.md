# toolbox

Meu ambiente de desenvolvimento pessoal, versionado. Este repo é a **fonte
única**: a máquina consome daqui por symlink, e qualquer deriva aparece no
`git status` em vez de se esconder em cópias.

O padrão veio do `.agents/skills/` do Project A, que aprendeu na prática que
cópia-por-provider deriva — quando as skills vieram para cá, a única diferença
entre as cópias do `tlc-spec-driven` no project-b e no Project A era o prefixo
de caminho dos scripts.

## Instalar numa máquina nova

```bash
git clone git@github.com:Lukiita/toolbox.git
cd toolbox && ./install.sh
```

Idempotente: rodar de novo só confirma o estado. O que ele liga:

| destino | alvo | como |
|---|---|---|
| `~/.claude/skills` | `skills/` | symlink |
| `~/.agents/skills` | `skills/` | symlink (caminho canônico que as skills referenciam) |
| `~/.claude/CLAUDE.md` | `claude/CLAUDE.md` | symlink |
| `~/.claude/settings.json` | `claude/settings.json` | **cópia** — o Claude Code reescreve esse arquivo sozinho; symlink seria quebrado pela primeira escrita atômica do app. Divergência vira aviso com diff, nunca sobrescrita. |

O que existia antes vira backup `*.pre-toolbox.<timestamp>` ao lado.

## Estrutura

```
skills/     8 skills globais (valem em qualquer sessão, qualquer projeto)
claude/     CLAUDE.md global + settings.json compartilhável
archon/     fonte canônica do fluxo Archon (tlc headless) — importado, não linkado
hooks/      vazio por ora
install.sh
```

## Skills

| skill | papel |
|---|---|
| `grilling` | entrevista implacável para stress-testar uma decisão |
| `grill-with-docs` | grilling + domain-modeling (gera glossário e ADRs no caminho) |
| `domain-modeling` | linguagem ubíqua (`CONTEXT.md`) + ADRs (`docs/adr/`) |
| `tlc-spec-driven` | Specify → Design → Tasks → Execute com Verifier independente (`.specs/`) |
| `capability-sync` | contrato vivo de comportamento (`.specs/capabilities/`) |
| `code-review` | revisão do diff antes do PR, duas lentes + triagem |
| `pr-review-triage` | triagem dos comentários de PR aberto (CodeRabbit etc.) |
| `skill-creator` | cria e avalia skills novas |

**Como elas conversam** (harmonizado em 2026-08-17): specs e designs do tlc
usam os termos do `CONTEXT.md`; designs conformam com ADRs aceitos em
`docs/adr/`; decisão `AD-NNN` do `STATE.md` que passa no teste triplo de ADR
vira ADR com o AD apontando para ele; e os comandos de script usam o prefixo
canônico `~/.agents/skills/` (que o install.sh garante).

## Global vs por-projeto

Skills daqui são **globais**. Projeto que precisa delas em runtime headless
(ex.: worktrees do Archon, CI) leva **cópia** em `.agents/skills/` do repo,
importada daqui — e dentro do projeto, o padrão é `.claude/skills` e
`.cursor/skills` como symlinks relativos para `.agents/skills/` (como o
Project A faz). O toolbox é o árbitro: melhoria feita numa cópia volta para cá.

## archon/ — como importar num projeto

O fluxo é intrinsecamente por-projeto (worktrees, gate do repo, AGENTS.md),
por isso é importado, não linkado:

1. copie `archon/` para `.archon/` do projeto;
2. adapte `scripts/repo-gate.sh` (o gate de lint/typecheck/teste do repo) e
   `config.yaml` (aliases de modelo por papel);
3. garanta `tlc-spec-driven`, `capability-sync` e `code-review` em
   `.agents/skills/` do projeto — os worktrees precisam delas dentro do repo;
4. revise os `commands/` (eles citam convenções do repo de origem — AGENTS.md,
   `pnpm gate`, política de idioma) e rode
   `archon validate workflows && archon validate commands`.

O `archon/README.md` e o `WORKFLOWS.md` documentam o desenho e já foram
escritos para viajar entre projetos.

## Nunca versionar aqui

- `settings.local.json`, `.env*` — segredo e aprovação local;
- `~/.claude/projects/`, histórico, sessões — estado de máquina, não ambiente;
- aprovações de permissão acumuladas de sessões — o `claude/settings.json`
  guarda só preferência estável.

## Próximo passo

Construir a skill `ddd-tatico` (via `skill-creator`) e pilotá-la no Project A
modelando o agregado Assinatura+Plano.
