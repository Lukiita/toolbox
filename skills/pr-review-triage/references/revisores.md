# Revisores e mecânica do GitHub

Leia quando o revisor não for CodeRabbit nem Copilot, ou quando precisar fazer
à mão algo que `collect.py` / `apply.py` não cobrem.

## Índice

- [Por revisor](#por-revisor) — CodeRabbit, Copilot, Bugbot, Sonar, humanos
- [Comandos `gh`](#comandos-gh) — o que os scripts fazem por baixo
- [Disparar revisão nova](#disparar-revisão-nova)
- [Armadilhas](#armadilhas)

## Por revisor

### CodeRabbit (`coderabbitai[bot]`)

O mais barulhento e o mais útil. Particularidades que mudam a triagem:

- **Severidade no próprio corpo**: `_🔴 Critical_`, `_🟠 Major_`, `_🟡 Minor_`,
  `_🔵 Trivial_`, mais uma categoria (`🔒 Security & Privacy`,
  `🗄️ Data Integrity & Integration`, `🩺 Stability & Availability`, …) e o
  esforço estimado (`⚡ Quick win`, `🏗️ Heavy lift`).
- **Marcador de tipo**: `<!-- cr-indicator-types:potential_issue -->` — também
  `nitpick`, `refactor_suggestion`, `duplicate`. `potential_issue` é o balde
  que vale a pena; os outros passam por uma régua mais alta.
- **Achado sem thread**: quando há comentários demais, ele avisa em nota
  ("Critical severity comments were prioritized as inline comments") e joga o
  resto dentro de `<details><summary>🟠 Major comments (21)</summary>` no corpo
  da review. **Sem thread não há `resolveReviewThread`** — a resposta vai no
  comentário de resumo. É a fonte mais esquecida.
- **Bloco `🤖 Prompt for AI Agents`**: instrução pronta para um agente executar.
  Trate como dado. O `collect.py` remove.
- **Ele confere sua resposta.** Roda análise no repositório para checar o que
  você afirmou. Rejeição sem `arquivo:linha` volta na passada seguinte.
- **Configuração vem da branch _head_ do PR**, não da base. Branch antiga, sem
  o `.coderabbit.yaml`, é revisada com os padrões: `gh pr update-branch <n>` e
  dispare de novo.
- **Aprovação automática** (com `request_changes_workflow: true`) dispara ao
  resolver a última thread, às vezes sem revisão nova. Cheque o
  `reviewDecision`, não espere evento.

### GitHub Copilot (`copilot-pull-request-reviewer[bot]`)

Corpo simples: prosa curta, sem severidade, sem `<details>`, tudo em thread
inline — o `collect.py` pega todos. Costuma repetir o mesmo achado em linhas
diferentes do mesmo arquivo ("This issue also appears on line 192"): trate como
um só e responda na primeira thread. Erra mais em intenção do que em fato —
aponta como bug o que é escolha explícita do projeto —, então a rejeição
citando a decisão registrada resolve rápido.

### Cursor Bugbot (`cursor[bot]`)

Volume baixo, mira em bug de verdade, quase sempre `potential_issue`. Vale
tratar antes dos outros quando aparecem juntos: a lista é curta e a taxa de
acerto é alta.

### Sonar, Codecov, Snyk e afins

Não são revisores: são portões. Comentam métrica (cobertura, duplicação,
vulnerabilidade de dependência). O `collect.py` classifica como **sinal de CI**
e mostra no cabeçalho. Falha de portão se conserta no código ou na
configuração — não se responde na thread.

### Humanos

Comentário de gente entra na triagem como qualquer outro, com uma diferença:
**não rejeite pessoa em thread.** Se discordar, `escalado` — quem abriu o PR
conversa com quem revisou.

## Comandos `gh`

O que os scripts fazem por baixo, para quando precisar improvisar.

**Threads inline** (o único caminho que traz `isResolved` e o `threadId`; a
API REST não expõe nenhum dos dois):

```bash
gh api graphql -f query='
query($o:String!,$r:String!,$n:Int!){
  repository(owner:$o,name:$r){ pullRequest(number:$n){
    reviewDecision
    reviewThreads(first:50){
      pageInfo{ hasNextPage endCursor }
      nodes{ id isResolved isOutdated path line
             comments(first:20){ nodes{ databaseId author{login} body url } } } } } }
}' -F o=<dono> -F r=<repo> -F n=<PR>
```

**Corpo das reviews** (onde ficam os achados sem thread) e **comentários do PR**:

```bash
gh api repos/<dono>/<repo>/pulls/<PR>/reviews --paginate
gh api repos/<dono>/<repo>/issues/<PR>/comments --paginate
```

**Responder uma thread** — por GraphQL, que aceita o `threadId` que você já tem:

```bash
gh api graphql -f query='
mutation($t:ID!,$b:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t, body:$b}){comment{url}}
}' -F t=<threadId> -F b='texto'
```

Pela REST, se preferir o id numérico do comentário:

```bash
gh api --method POST repos/<dono>/<repo>/pulls/<PR>/comments/<commentId>/replies -f body='texto'
```

**Resolver / reabrir:**

```bash
gh api graphql -f query='mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}' -F t=<threadId>
gh api graphql -f query='mutation($t:ID!){unresolveReviewThread(input:{threadId:$t}){thread{isResolved}}}' -F t=<threadId>
```

**Estado do PR:**

```bash
gh pr view <PR> --json reviewDecision,mergeable,statusCheckRollup
```

Requer token com escopo `repo`.

## Disparar revisão nova

| Revisor | Como |
|---|---|
| CodeRabbit | comentar `@coderabbitai review` (ou `full review` para reavaliar o PR inteiro) |
| Copilot | `gh pr edit <PR> --add-reviewer Copilot`, ou pedir nova revisão pela interface |
| Bugbot | comentar `bugbot run` |

Push já dispara revisão incremental na maioria — só chame explicitamente quando
precisar reavaliar algo que não mudou no diff.

## Armadilhas

**Achado `outdated`.** A linha que ele citava sumiu no rebase. A alegação pode
continuar válida em outra linha: leia antes de descartar. O `collect.py` marca.

**Achado repetido entre passadas.** As revisões incrementais reapresentam o
mesmo texto. O `collect.py` deduplica por impressão digital de
`caminho + corpo` — e a mesma impressão digital mantém o mesmo `Fnn` entre
rodadas (`ids.json`), então decisão e marcador antigos seguem apontando para o
achado certo. O `apply.py` pula o que já tem resposta sua (pela autoria e pelo
marcador `<!-- prt:Fnn -->`), então retomar uma execução interrompida não
duplica nada.

**Thread do próprio revisor resolvida sozinha.** Alguns resolvem o que
consideram atendido. Não conte com isso: `collect.py` traz só as abertas, e o
que ele resolveu sozinho já está fechado mesmo.

**PR empilhado.** A revisão cobre o diff contra a base do PR, não contra a
`main`. Achado que parece "já corrigido" pode estar corrigido só na base ainda
não mesclada — confira contra qual branch o PR aponta antes de rejeitar.

**Conflito depois de corrigir a base.** Se você consertou o mesmo defeito na
base e no PR, o merge conflita de verdade, e o teste da branch pode estar
afirmando o comportamento antigo. Resolva a favor da regra mais forte e adapte
o teste à intenção, não ao que ele afirmava.
