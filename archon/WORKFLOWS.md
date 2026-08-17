# Os workflows por dentro

> **Documento herdado.** Ele veio do projeto de origem (`project-b`) junto com
> o grafo, e foi mantido porque o **raciocínio** de cada nó porta sem mudança.
> Os **dados** não portam: nenhum número, custo, run-id, número de PR ou nome de
> arquivo citado aqui foi medido neste repositório. Onde o texto disser
> `src/lib/`, `pnpm test`, `db-change` ou pgTAP, a regra equivalente deste repo
> está no `AGENTS.md` da raiz — os arquivos que o Archon realmente executa
> (`workflows/`, `commands/`, `scripts/`) já foram adaptados; este aqui é
> leitura.
>
> Quando este repo tiver medição própria de custo por nó e de achados exclusivos
> por camada, ela substitui a de lá, e esta nota some.

O `README.md` deste diretório diz **quando** usar cada workflow. Este diz **o que
acontece dentro** de cada um, nó a nó, e por quê.

Documento de leitura, não de referência: lê-se uma vez do começo ao fim.

---

## A gramática do YAML

Sem isto, o arquivo é opaco:

| No YAML | Significa |
|---|---|
| `prompt:` | um agente Claude roda com aquele texto |
| `bash:` | script — **sair com código ≠ 0 para o fluxo inteiro**. É assim que todo portão funciona |
| `command:` | comando pronto — o prompt mora em `.archon/commands/<nome>.md`. **Não aceita argumento**: o Archon lê a string inteira como nome do arquivo |
| `context: fresh` | o nó **começa do zero**: não viu nada do que aconteceu antes |
| `depends_on:` | ordem de execução |
| `when:` | condicional — se falso, **pula** (não falha) |
| `trigger_rule: one_success` | roda se ao menos um dos pais completou (o Archon espera todos assentarem antes de avaliar) |
| `output_format:` | obriga o nó a devolver JSON com campos definidos, usável em `when:` |

Duas pegadinhas que já custaram tempo:

- **Substituição vem pré-citada.** Escreve-se `VAR=$node.output` — sem aspas. `"$node.output"` produz valor errado, e o `archon validate workflows` acusa.
- **`--branch X` cria a branch a partir da `main`.** Para que uma spec commitada em outra branch fique visível no worktree, é obrigatório passar `--from <branch-da-spec>`.

---

## As três garantias

Cada nó existe por causa de uma delas. Se algo no fluxo parecer cerimônia, é
porque uma destas está sendo comprada:

**1. Spec-first.** Decisão de escopo é interativa; o Archon só executa o que já
foi decidido. Nós headless não sabem perguntar — o único ponto humano no meio de
uma run é um `approval:` gate.

**2. Autor ≠ verificador.** Quem escreve nunca é quem aprova. Instrução em YAML
ou em skill **não dispara sub-agente**: quem lê a instrução é o mesmo agente que
escreveu o código, se auto-avaliando. Nós separados com `context: fresh`, sim.
Por isso a independência é propriedade do grafo, não do prompt.

**3. Nada muta depois do carimbo.** A verificação é a **última** checagem antes
do PR — revisão e correções acontecem antes dela. Por isso o
`validation.md` sempre descreve exatamente o código que chega ao PR. Esta
garantia é comprada com **ordenação**, não com um passo de reconciliação: a
versão anterior deste fluxo revisava depois do PR e precisava de um `re-gate`
para consertar a evidência que envelhecia. Trocar a ordem apagou o problema.

---

## Os três níveis de validação (a confusão mais comum)

A tlc valida **três vezes**, com donos diferentes. Confundir os níveis é o que
faz o `implement` parecer contraditório:

| Nível | Quem roda | O quê | Onde |
|---|---|---|---|
| **1. Por tarefa** | **o implementador** | critérios "Done when" + gate (testes passam) antes de **cada** commit | dentro do nó `implement` |
| **2. Feature** | **Verifier independente** | evidence-or-zero, regressão de capacidade, sensor de discriminação | nó `verify`, contexto fresco |
| **3. UAT** | humano | só feature de interface | fora do Archon (headless não tem usuário) |

O implementador **roda o nível 1 e é obrigado a isso**. O que ele não pode fazer
é o nível 2 — autocertificação é exatamente o que este fluxo existe para
impedir. Ele também não escreve o `validation.md`.

---

## `tlc-apply-feature` — o caminho principal

19 nós, em **5 movimentos**:

```
① ACHAR A SPEC       extract-slug → verify-feature → tasks-restantes
② IMPLEMENTAR        implement → adr-gate → validate
③ REVISAR            limpa-must-fix → review → must-fix-restantes → [fix → validate-fix]
④ VERIFICAR ★        verify → [fix-gaps → re-verify] → verdict-gate
⑤ CONTRATO E PR      sync-capabilities → capability-gate → create-pr → finalize
```

**A ordem é o desenho.** A revisão vem antes da verificação, então o carimbo do
Verifier cai sobre o código final — nada muta depois dele. Uma versão anterior
invertia isso (revisão depois do PR) e precisou de 13 nós a mais, incluindo um
`re-gate` só para reconciliar a evidência que envelhecia. Ordenar certo apagou
o problema em vez de remediá-lo.

### ① Achar a spec

`extract-slug` (modelo pequeno) transforma "aplica a feature cores-categoria" no
slug puro. `verify-feature` (bash) confere que `.specs/features/<slug>/spec.md`
existe e **falha rápido** se não.

*Por quê:* o worktree nasce da `main`. Sem `--from`, a spec não está lá — e sem
este portão o `implement` inventaria a feature em vez de seguir a sua.

### ② Implementar

`implement` (fresh, modelo grande) segue o contrato de execução da tlc: teste
derivado dos critérios de aceite, gate por tarefa, commit atômico por tarefa,
nunca enfraquecer teste para passar. Roda o **nível 1** de validação.

`validate` (bash) roda o gate do repo: lint + typecheck + testes, mais o pgTAP
quando o diff toca `supabase/migrations/` ou `supabase/tests/`. **Bash, não
agente**, e essa escolha é o desenho: o `implement` já termina rodando esse
mesmo gate e consertando o que quebra, então um agente aqui repetiria o
trabalho e — pior — relataria o vermelho honestamente e deixaria a esteira
seguir. Vermelho aqui é parada de esteira, e isso é um `exit 1`, não um
julgamento. Custo zero de modelo.

### ③ Revisar

`review` (fresh) revisa e tria, com **a skill `code-review`**: duas lentes
(bugs no diff; regras do `CLAUDE.md` + `.specs/capabilities/`) mais um check
determinístico de divergência da base, e uma triagem de confiança 0–100 que só
deixa passar o que pontuou ≥ 80.

**`review` não conserta** — é read-only sobre o código, e isso é propriedade do
grafo, não promessa de prompt: o nó que revisa não tem por onde escrever. Quando
sobra must-fix, ele grava `$ARTIFACTS_DIR/.must-fix`, um nó bash grepa
(`must-fix-restantes`) e só então o `fix` acorda para aplicar as correções. Se a
revisão veio limpa, o `fix` é pulado e não custa contexto nenhum.

O marcador é apagado por um nó bash (`limpa-must-fix`) logo antes da revisão:
o `$ARTIFACTS_DIR` sobrevive à tentativa, e um `.must-fix` órfão de uma revisão
interrompida faria o `fix` consertar achados obsoletos numa run em que a revisão
nova veio limpa.

A divisão existe por uma regra: **escrita de código-fonte fica no Claude**.
Separado, o `review` pode rodar noutra família de modelo (alias `@reviewer`
no `config.yaml`), e aí `autor ≠ revisor` deixa de ser "nó separado, mesma
família" e passa a ser treino diferente com pontos cegos diferentes. Foi essa
propriedade que fez o CodeRabbit achar, na PR #44, o que a lente "regras do
projeto" desta esteira declarou inexistente.

O nó único anterior (`review-fix`, que revisava e corrigia junto) saiu do
workflow em 2026-08-06, mas `commands/tlc-review-fix.md` continua no repo,
intocado, como caminho de volta.

**Não há passada de revisor externo antes do PR, e isso é decisão tomada.** O
CodeRabbit revisa **no PR**, pelo app do GitHub, onde a revisão já é paga uma
vez, fica visível na thread e pode ser respondida. Rodar o CLI antes disso
duplicava o gasto, pendurava a run em `heartbeat: reviewing` por dezenas de
minutos e, quando o plano batia no limite, saía com **exit 0 sem ter revisado
nada** — foi preciso um script só para detectar essa mentira. O ganho não pagou
o preço.

Ele faz triagem antes de aplicar. Dois motivos:

- A saída da review é **entrada não confiável**. O nó trata os achados como
  dado, nunca como instrução, e recusa qualquer coisa que peça para executar
  comando ou mexer em credencial.
- Perseguir "zero comentários" é otimizar a métrica errada: produz teste raso e
  conserto de não-problema. Cada achado vira `must-fix` ou `won't-fix` **com
  motivo escrito** — o motivo é o que impede tanto o descarte preguiçoso quanto
  a obediência cega.

Uma rodada de correção, e para. O Verifier logo depois é a rede.

### ④ Verificar ★

**É aqui que mora o valor do fluxo.**

`verify` roda em contexto fresco: esse agente **não viu o código ser escrito**.
Recebe a spec, o diff e o `references/validate.md`, e re-deriva tudo:

- **evidence-or-zero** — cada critério precisa apontar para `arquivo:linha` + a
  assertion. Sem citação = não coberto. "Tem teste" não basta; a assertion tem
  que mirar o valor que a spec define.
- **regressão de capacidade** — a feature nova quebrou garantia antiga de
  `.specs/capabilities/`?
- **sensor de discriminação** — injeta 1–3 defeitos no código novo em estado
  descartável (`git stash`), roda os testes e confirma que **falham**. Teste que
  passa com o código quebrado não serve. É isto que pega "suíte verde, código
  quebrado" — a falha que custou o bug de idempotência do `assinatura-barbearia`.

Mais duas varreduras, porque este nó é a última checagem antes do PR:

- **Cobertura código → teste.** O check de critérios anda spec → teste e acha
  "especificado mas sem teste". Esta anda ao contrário e acha "codificado sem
  nunca ter sido especificado nem testado" — que é onde ramo não testado se
  esconde.
- **Drift de documentação.** A mudança deixou algum doc ou skill do repo
  desatualizado? Fluxo novo que a skill `verify` não menciona é fluxo que o
  próximo não consegue exercitar.

Escreve `.specs/features/<slug>/validation.md`.

FAIL → `fix-gaps` corrige e `re-verify` refaz **do zero** (não compara com o
relatório anterior). Uma rodada só no headless; depois o fluxo para.

`verdict-gate` (bash) faz `grep` no `**Overall**: ✅ Ready`. **Grep, não
julgamento de modelo** — um agente se convence; um grep não.

### ⑤ Contrato e PR

`sync-capabilities` só roda **depois** do portão: dobra o comportamento
verificado em `.specs/capabilities/`. FAIL não sincroniza nada — comportamento
não verificado nunca entra no contrato.

`create-pr` abre o PR **já pronto** (não draft): ele passou pelo `review` (mais
o `fix`, quando sobrou must-fix) e pela verificação independente, então é
trabalho terminado, não rascunho. O corpo cita o veredito, o resultado do sensor
e a triagem dessa revisão — inclusive o que foi **recusado e por quê**. A
revisão externa (CodeRabbit) entra depois, no PR, e é justamente por isso que
ele não nasce draft.

`finalize` confere a base do PR e resume onde ficou cada evidência.

---

## Quando uma run morre no meio: retome, não re-rode

**O comando é este, e ele não aparece em `archon --help`:**

```bash
archon workflow resume <run-id>          # id vem de `archon workflow runs`
```

Ele pula os nós já concluídos (`[review] Skipped (prior_success)`) e recomeça
no que falhou, **dentro da mesma worktree**. Medido na sonda: run com `a → b → c`,
`c` falhando; o `resume` executou só o `c`.

**O que NÃO retoma, e cada um custa a esteira inteira de novo:**

| tentativa | o que acontece |
| --------- | -------------- |
| `archon workflow run <nome> --branch <slug> "<msg>"` | run **nova**, do zero. Foi assim que a `avaliacoes` re-pagou o `implement` |
| re-invocar igual, mesmo cwd e mesma mensagem | não retoma. A doc embutida do Archon diz que "auto-resume is default" — **é falso pelo CLI**, testado |
| `--conversation-id` fixo entre as invocações | não retoma. Testado |
| a flag `--resume` | casa a run pelo **cwd**, não pelo id. Do repo raiz pega a run errada; apontada para a worktree (`--cwd`) estoura em `Cannot resume: repository registration failed` — [issue #2127](https://github.com/coleam00/Archon/issues/2127), **ainda reproduz na v0.6.0** apesar de fechada |

O preço de não saber disso: 8 runs da `avaliacoes`, US$ 25 de modelo, e 78 dos
142 minutos de agente gastos no `implement` re-entrando numa feature pronta.

**Antes de retomar, mate a run zumbi.** Run que ficou em `running` sem processo
vivo bloqueia a próxima e não aparece como falha:

```bash
archon workflow status                   # está "running" há horas?
archon workflow abandon <run-id>         # `cancel` não existe como subcomando do CLI
```

### `one_success` não é o que o nome sugere

Medido em sonda, porque a intuição erra aqui:

| pais | `one_success` | `none_failed_min_one_success` |
| ---- | ------------- | ----------------------------- |
| um falhado + um concluído | **roda** o filho | pula |
| um pulado + um concluído | roda | roda |
| um falhado + um pulado | pula | pula |

A linha perigosa é a primeira. Um nó com `one_success` ao lado de um irmão que
**sempre conclui** deixa passar o pai falhado — foi o caso do `adr-gate`, onde
`tasks-restantes` (bash, sempre verde) fica ao lado do `implement`: um
`implement` que morre no meio liberava `validate → review → fix → verify →
create-pr` sobre uma feature pela metade. O gate de testes não pega isso —
código que nem chegou a ser escrito não quebra teste nenhum. Achado pelo
CodeRabbit na PR #39 e corrigido para `none_failed_min_one_success`.

A regra continua deixando passar **pai pulado**, e é isso que o `adr-gate`
precisa: o `implement` tem `when` e é legitimamente pulado quando não sobrou
caixa aberta no `tasks.md`. A objeção óbvia — "e um `implement` pulado porque um
ancestral quebrou, esse não passa também?" — morre no grafo: **todo ancestral do
`implement` é o `tasks-restantes` ou ancestral dele**. Ancestral quebrado pula ou
falha os dois pais, e aí o gate fica sem nenhum pai concluído. O par
"pulado + concluído" só é alcançável pelo `when`, que é o caminho deliberado.

**Os outros `one_success` do repo estão certos e não devem ser trocados**: em
todos, os pais são ramos mutuamente exclusivos (`investigate`/`plan`,
`verify`/`re-verify`), então a combinação perigosa não é alcançável. O comentário
em cada nó explica o porquê — leia antes de "uniformizar".

### Falha não desce como falha: desce como "pulado"

A tabela acima fala dos pais **diretos**, e é literal — `checkTriggerRule` só
olha o estado deles (`dag-executor.ts:1156`). O que quase ninguém supõe é o que
acontece com o **neto**: um nó pulado porque um ancestral falhou é gravado como
`skipped`, não como `failed` (`dag-executor.ts:5700`).

Consequência prática, e ela já custou um bug aqui: `gate` vermelho → `respond`
vira `skipped` → um `finalize` com `none_failed_min_one_success` sobre
`[respond, collect]` vê "um pulado + um concluído" e **roda**, anunciando
tratamento sobre uma resposta que nunca foi postada. A proteção estava escrita e
mirava o alvo errado: cobria `respond` **falhar**, não `respond` **sumir**.

O conserto que vale não é ajustar a regra de trigger — isso resolve a instância,
não a classe. É o nó de relato **consultar o mundo em vez de afirmar o que
fez**. Relato derivado de contagem (threads abertas, review no HEAD, estado do
PR) não tem como mentir sobre uma run que quebrou no meio; relato que afirma o
que o próprio fluxo fez, sim. O `finalize` do `tlc-apply-feature` segue essa
regra ao ler o PR em vez de declarar sucesso.

### O `tasks-restantes` continua valendo

Ele não é redundante com o `resume`: cobre o caso em que a run nova é
legítima (spec corrigida, sessão de outro dia) e não há run anterior para
retomar. Um grep respondendo "não sobrou caixa aberta" é mais barato que
acordar o Opus para ele descobrir o mesmo. **Checkpoint equivalente para
`review`, `fix` e `verify` foi avaliado e descartado** — duplicaria a retomada
nativa, que já pula nó concluído sem nenhuma máquina no YAML.

---

## O que saiu da branch em 04/08, e por quê

Este arquivo já descreveu sete workflows. Hoje descreve **um**.

Os outros seis — `archon-fix-github-issue`, `tlc-fix-bug`, `tlc-db-change`,
`tlc-pr-review`, `tlc-pauta-to-issues` e `tlc-pr-findings` — foram
escritos nesta branch e **nunca rodaram ponta a ponta**. Passavam no
`archon validate`, o que prova sintaxe, não comportamento. Deixar YAML não
testado visível para o Archon anuncia um suporte que não existe, e prova sete
coisas ao mesmo tempo: qualquer falha fica cara de localizar.

Voltam **um por PR**, cada um respondendo uma pergunta só — "este fluxo reusa
corretamente a linha já provada?". A ordem e o `git checkout` para recuperá-los
estão no `README.md`, seção Backlog.

Três coisas que a poda muda no dia a dia, e vale saber:

- **`archon-fix-github-issue` era um override.** Sem o nosso arquivo, esse nome
  passa a resolver para o workflow **empacotado do Archon**, que não conhece as
  regras deste repo, não tem `spec-gate` e não roteia para a tlc. Não rode
  achando que é o nosso.
- **Mudança de banco** continua coberta: a skill `db-change` faz migration + RLS
  + pgTAP juntos numa sessão, e é a mesma skill que o `implement` do
  `tlc-apply-feature` usa.
- **Achado de revisão do CodeRabbit é tratado à mão** durante o piloto. O
  `tlc-pr-findings` volta como **skill**, não como workflow: quando o laço
  automático morreu, o trabalho virou interativo — você dispara quando os
  comentários chegam, acompanha a triagem e às vezes precisa decidir um
  `NEEDS_DISCUSSION`. O que o workflow comprava e a skill não compra de graça é
  ordem obrigatória e gate mecânico; isso volta como script (coletar → agente
  tria → `repo-gate.sh` → publicar as respostas), não como DAG.

### O que a construção do ciclo de revisão mediu, e continua valendo

Nada disto depende dos arquivos que saíram — vale para quem trata comentário à
mão, e vale para a skill quando ela vier:

- **Coletar por um canal só devolve metade.** Achado que o CodeRabbit não
  consegue prender a uma linha do diff vira texto no corpo da review, sob
  `Outside diff range comments (N)`, e **não aparece** em
  `gh api repos/<o>/<r>/pulls/<n>/comments`. Medido na PR #39: 2 de 4 achados.
  O resto mora em `.../pulls/<n>/reviews`, e só o endpoint REST traz o
  `commit_id` — o campo que amarra a passada de revisão ao código que ela viu.
- **Thread resolvida some da coleta**, e o CodeRabbit auto-resolve quando julga
  que um commit endereçou o achado. Quem confia só na lista de threads abertas
  perde o que ele fechou sozinho.
- **Contador no corpo da review é texto congelado**: não diminui quando se
  conserta. Serve para relatar, nunca para decidir "ainda há trabalho".
- **A auto-pausa do CodeRabbit é o pior modo de falha que existe aqui**: depois
  de 5 commits revisados ele para de revisar em silêncio, e a convenção deste
  repo é um commit por correção. O `.coderabbit.yaml` zera a pausa; se ainda
  assim parar, `@coderabbitai review` no comentário fura.
- **Não persiga "zero comentários".** Achado recusado com motivo escrito na
  thread é melhor que conserto de não-problema — e o motivo escrito é o que
  permite a quem revisou contestar.

### O carimbo que vence

A garantia nº 3 ("nada muta depois do carimbo") é comprada com **ordenação**: a
revisão e as correções vêm antes do `verify`, então o `validation.md` descreve o
código que chega ao PR. Tratar achado depois do PR aberto é o único passo que
muda código **depois** do carimbo — e aí a evidência anexada envelhece.

O `validation.md` registra `**Commit verificado**: <sha>` para tornar isso
decidível — e o sha é o do **último commit de código**, não o do HEAD:

```bash
git log -1 --format=%H -- . ':!.specs'
```

**Carimbar o HEAD cru não funciona, e isso já foi defeito aqui.** O próprio
Verifier commita o `validation.md` depois de carimbar, e o `sync-capabilities`
commita de novo: o HEAD fica diferente do carimbo sem nenhuma linha de código
ter mudado, e a comparação acusaria deriva em toda run — o que é o mesmo que
não acusar nada. Excluir `.specs/` corta exatamente a classe que o próprio fluxo
produz depois de carimbar: o campo passa a valer **o último commit fora de
`.specs/`**. Evidência que chega depois não move; mudança de fonte, sim.

**O corte é por `.specs/`, não por "código".** Um commit posterior em `docs/` ou
neste arquivo também move o carimbo — e aí a comparação acusa deriva sem que uma
linha de fonte tenha mudado. Fica assim de propósito: a alternativa é uma lista
branca de caminhos de código, que precisa ser mantida em todo repo onde a skill
aterrissar e envelhece calada. Alarme falso de commit de doc custa uma releitura;
alarme perdido de commit de fonte custa um PR com evidência mentindo.

Conferir depois, à mão, é o mesmo comando dos dois lados:

```bash
grep 'Commit verificado' .specs/features/<slug>/validation.md
git log -1 --format=%H -- . ':!.specs'
```

Diferentes? A evidência está velha: rode o Verifier de novo antes de mergear.

## Dívida conhecida

**O miolo triplicado foi resolvido, e a poda de 04/08 colheu o resultado.** Três
workflows abriam PR carregando cópia da mesma cadeia de revisão e verificação;
a extração em peças de dono único veio antes da poda, e é por isso que remover
seis workflows não levou junto o que valia. O que ficou de pé, tudo chamado pelo
`tlc-apply-feature`:

| peça | onde mora |
| ---- | --------- |
| gate do repo (lint/typecheck/test + pgTAP condicional) | `scripts/repo-gate.sh` |
| portão do veredito (parametrizado por relatório e formato) | `scripts/verdict-gate.sh` |
| digital das entradas do ADR | `scripts/adr-inputs-fingerprint.sh` |
| fecho do PR (re-target da base + handoff) | `scripts/pr-finalize.sh` |
| revisão + triagem (read-only) | `commands/tlc-review.md` |
| correção dos must-fix | `commands/tlc-fix-review.md` |
| revisão + correção num nó só (aposentado, mantido para revert) | `commands/tlc-review-fix.md` |
| contrato do Verifier da tlc | `commands/tlc-verify-feature.md` |
| sync do contrato de capacidades | `commands/tlc-sync-capabilities.md` |

**O `fix-gaps` e o `re-verify` ficaram inline de propósito.** Eles ancoram na
spec (`.specs/features/<slug>/`), escrevem `validation.md` versionado na branch,
checam regressão de capacidade e usam o formato `**Overall**: ✅ Ready`. Os
comandos equivalentes dos fluxos removidos ancoravam na investigação e escreviam
`verification.md` no artifacts da run, com `VERDICT: PASS`. Forçar um comando só
exigiria condicional dentro do prompt — troca duplicação honesta por acoplamento
escondido.

O `verify`, esse, **é comando com um chamador só**, e continua assim de
propósito: o critério é "a cópia viraria divergência?", e a resposta muda com o
tamanho do contrato — 79 linhas de verificação valem versionadas à parte mesmo
com um chamador. Quem já cobrou esse juro foi o tier de modelo, defasado duas
semanas em dois arquivos.

**A dívida cobrou juros antes de ser paga — vale o registro.** A descida de
`large` para `medium` na cadeia de revisão foi aplicada só no
`tlc-apply-feature`; os outros dois ficaram em `large` por duas semanas, até
o CodeRabbit apontar na PR #39. Junto vieram três defasagens no mesmo lugar: a
alegação de "externally reviewed" no `create-pr`, o comentário do `verdict-gate`
citando revisão externa, e — a pior — o mesmo prompt mandando `Create a draft
pull request` no topo e `(not a draft…)` no passo 6. Essa última tinha
consequência real: o `.coderabbit.yaml` não revisa draft, então o PR sairia sem
a revisão de que o fluxo passou a depender.

### Os quatro bloqueadores do piloto — corrigidos em 04/08

Achados em avaliação estática, antes de qualquer run. Ficam registrados porque
os três primeiros são a mesma classe de erro: **um passo posterior desfazendo a
garantia de um passo anterior, sem ninguém perceber.**

1. **`create-pr` commitava fonte depois do carimbo.** O prompt mandava commitar
   "source files that are part of the feature", e ele roda depois do `verify`,
   do `verdict-gate` e do `sync-capabilities` — ou seja, o PR podia sair com
   código que o Verifier nunca viu, carregando um `validation.md` que dizia o
   contrário. Agora ele classifica cada arquivo sujo: scratch se ignora,
   evidência se commita, **e qualquer outra coisa falha o nó**. Não conserta,
   não commita: para. A escolha é deliberada — recuperação automática aqui
   significaria abrir PR com evidência falsa.

   **Evidência é uma lista de arquivos exatos, não um diretório** —
   `.specs/features/<slug>/validation.md`, `.specs/LESSONS.md`,
   `.specs/lessons.json`, e nada mais. Foram duas passadas do CodeRabbit na #39
   para chegar nisso, e as duas apontaram a mesma coisa: `.specs/**` inteiro
   como "evidência" varre para dentro do commit coisas que não são evidência.

   - `.specs/capabilities/` é o **contrato vivo**. O `capability-gate` logo antes
     já rodou o `capabilities.py check` e provou o diretório limpo no worktree e
     no índice; sujo aqui significa que a garantia do portão quebrou depois dele.
   - `spec.md`, `design.md`, `tasks.md`, `context.md` são **entrada**, escritos
     interativamente antes da run. São a régua contra a qual o Verifier mediu o
     código — o `validation.md` é uma afirmação *sobre* eles. `spec.md` sujo aqui
     quer dizer que a régua andou depois do carimbo, e o relatório passa a alegar
     conformidade com uma spec que não existe mais.

   O segundo caso é o pior dos dois, e por um motivo específico: o carimbo é
   `git log -1 --format=%H -- . ':!.specs'`, que **exclui `.specs/` de propósito**
   (ver "O carimbo que vence"). Deriva de fonte a conferência posterior pega;
   deriva de spec, não. Commitar isso como evidência não é só errar a
   classificação — é enterrar a única pista.
2. **`capability-gate` não via staged.** `git diff --quiet` olha o worktree; um
   `git add` sem commit sumia do worktree-diff e o portão aprovava um contrato
   que não estava na branch. Agora checa worktree **e** índice.
3. **O carimbo por SHA nunca batia** — ver "O carimbo que vence" acima. Passou a
   registrar o último commit de **código**.
4. **CI vermelho.** `pnpm@11.13.0` é release quebrada — o `@pnpm/exe` saiu sem
   binário e o `pnpm/action-setup` recusa instalar (`ERR_PNPM_BROKEN_PNPM_RELEASE`).
   Subiu para `11.20.0`, com o `--frozen-lockfile` provado local: o lockfile
   continua aceito, sem regeneração.

O que **não** foi verificado por nada disso: se o fluxo funciona. Estática pega
contradição; só a run pega comportamento.

### Retentativa: desligada em todo nó de IA, e o motivo é caro

**O Archon classifica texto de rate-limit como erro TRANSITÓRIO e re-executa o
nó.** Não é uma re-tentativa da última chamada: é a **sessão agêntica inteira**
de novo — re-ler o artefato, re-raciocinar, re-editar. Com backoff de 2s, 4s e
8s, contra um limite que reseta em **horas**.

Medido em 2026-08-03, na rodada 2 do laço de revisão (já removido): o nó de
triagem bateu no
limite de sessão e o Archon o re-executou **3 vezes**, somando 15 eventos de
rate limit numa run só. Quatro execuções completas do nó mais caro do fluxo,
todas condenadas desde a primeira — porque nenhuma espera de 8 segundos devolve
cota que só volta em horas.

Por isso todo nó de IA dos workflows `project-b-*` carrega:

```yaml
retry:
  max_attempts: 1
```

**A assimetria é o argumento.** Sem retentativa, um erro de rede custa uma
retomada — `archon workflow resume <run-id>`, que pula tudo que já passou e é
barata. Com retentativa, um limite de cota custa 4× a sessão mais cara da
esteira, e o pior é que custa **sem chance de sucesso**.

Não existe meio-termo configurável: o `retry.on_error` só aceita `transient` ou
`all`, e texto de rate-limit cai em `transient` nos dois. Ou se desliga, ou se
paga.

O `retry` é **erro de parse** em nó `loop`/`loop_group` — nos laços ele vai nos
nós do corpo, nunca no nó do grupo.

### Quem roda cada nó, e por que `verify`/`re-verify` continuam em medium

Desde 2026-08-06 os nós com papel no desenho usam **alias**, não tier: alias diz
*quem faz o trabalho*, tier diz *quão capaz precisa ser*. Nó mecânico
(`extract-slug`, `create-pr`) continua em tier, porque ali a única pergunta é o
porte.

| alias | provider | nós | escreve fonte |
| --- | --- | --- | --- |
| `@author` | claude/opus | `implement` | sim |
| `@fixer` | claude/sonnet | `fix`, `fix-gaps` | sim |
| `@reviewer` | codex | `review` | não |
| `@verifier` | codex | — (definido, não ligado) | não |

Um alias por papel, e não por família, para dois papéis da mesma família
divergirem: `@author` parte de uma spec, `@fixer` parte de uma lista de
`arquivo:linha` — trabalho diferente, porte diferente.

`@verifier` não está ligado no `verify`/`re-verify` porque esses nós usam
`output_format`, e o veredito estruturado é o que dispara o `when` do
`fix-gaps`; não está verificado se o adaptador Codex honra isso. Enquanto isso
eles seguem em `medium`. A garantia que os nós de verificação compram é **autor ≠
verificador**, e ela é propriedade do **grafo** — nó separado com `context:
fresh` — não do porte do modelo. Sonnet com contexto zerado continua sem herdar
o modelo mental de quem escreveu o código. O que se perde é profundidade; o que
se ganha é o fluxo caber numa janela de cota em vez de morrer no meio sem
verificar nada. Meio fluxo em Opus entrega menos que o fluxo inteiro em Sonnet —
e isso não é hipótese: o `re-verify` da `avaliacoes` morreu por limite de sessão
em 2026-07-31, já rodando em medium.

**O que a construção do ciclo de revisão externa mediu está na seção "O que saiu
da branch" acima** — os canais da coleta, a auto-pausa, o `commit_id`. Três
medições ficam aqui porque são sobre *ferramenta*, não sobre aquele fluxo, e vão
reaparecer na skill que substituir o `tlc-pr-findings`:

- **A poda de ruído falhava aberta.** O coletor cortava os blocos `<details>` de
  "Analysis chain" e "Prompt for AI Agents" (45% do volume) e saía do modo
  "pula" quando as tags fechavam — só que o markdown do CodeRabbit **não fecha
  todas**: 21 aberturas para 19 fechamentos numa coleta real de 04/08. O bloco
  aberto arrastava o filtro até o fim do arquivo e engolia o cabeçalho das
  entradas seguintes: **3 das 8 threads abertas sumiram**, sem erro, sem aviso,
  com o artefato parecendo completo. Filtro de ruído precisa zerar o estado em
  toda fronteira de entrada. **Coletor que falha aberto é pior que coletor que
  quebra** — quem lê o artefato não tem como desconfiar.
- **A thread que o revisor fecha depois de responder não cai em canal nenhum**:
  a coleta pula resolvida, e a auditoria de "fechou sem a gente comentar" exige
  que a gente nunca tenha falado. A última palavra sendo dele, pode ser
  contestação. Medido na #39: 15 nessa situação, **as 15 confirmações**, 10 com o
  marcador `<review_comment_addressed>` que o próprio CodeRabbit põe.
- **Sinal congelado não pode decidir nada.** Contador no corpo da review não
  diminui quando se conserta; usá-lo como "ainda há trabalho" prende o veredito
  para sempre. Foi o defeito que fez o coletor antigo declarar achado aberto numa
  PR mergeada e inteiramente tratada.

**Rodado de ponta a ponta na `avaliacoes` (PR #38).** Deixou de ser raciocínio.
Quais nós ganharam o salário, pela evidência daquela feature:

- **`review-fix`** (o nó único de então; hoje `review` + `fix`) achou um bug real
  antes do PR: o `GET` do convite ignorava o `error` das duas queries do
  `Promise.all`, então falha de banco virava "sem atendimento concluído", sem
  log. Recusou dois achados com motivo escrito.
- **`verify`** reprovou, e por algo que nenhuma outra camada pegaria: a guarda
  "cliente anonimizado não escreve avaliação" vivia como `if` isolado na rota, e
  a mutação que a desligava passou pelo gate inteiro sem matar teste nenhum.
  Trilha LGPD. O `fix-gaps` extraiu para função pura testada; a mutação
  re-injetada depois morreu.
- **`tasks-restantes`** pagou por si: `implement` pulado por grep, custo zero,
  contra os ~US$ 1,86 que uma re-entrada dele havia custado para não produzir nada.
- **A ordem** (revisão antes da verificação) se provou: o carimbo do Verifier caiu
  sobre o código final, sem passada de reconciliação.

O que a feature também mostrou, e virou seção própria acima: **a esteira não
tinha problema de desenho, tinha problema de retomada** — as 8 runs foram
`workflow run` novo em vez de `workflow resume <run-id>`.

Os `*-findings.md` e `validation.md` das runs ficam em
`~/.archon/workspaces/<user>/<repo>/artifacts/runs/<run-id>/`.
