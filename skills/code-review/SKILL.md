---
name: code-review
description: Revisa o diff da branch contra a base — ANTES de abrir o PR, sem precisar de PR. Dois revisores em paralelo (bugs, regras do projeto), triagem de confiança que descarta falso positivo, e um check determinístico de divergência da base. Use sempre que o usuário pedir revisão de código, "revisa o que eu mudei", "olha esse diff", "tem bug nisso?", antes de abrir PR, ou quando um fluxo automatizado precisar de revisão antes do PR. Também quando o usuário terminar uma implementação e for commitar/abrir PR — revisar antes é mais barato que revisar depois. NÃO use para revisar PR de terceiros já aberto no GitHub (isso é `/review`), nem para verificar se a implementação cumpre uma spec (isso é o Verifier do tlc-spec-driven).
---

# Code review do diff, antes do PR

Roda sobre `git diff <base>...HEAD` — não precisa de PR aberto, o que a torna
usável dentro de um pipeline e em qualquer projeto.

Duas propriedades guiam tudo aqui:

**Precisão importa mais que cobertura.** Revisão que aponta dez coisas das quais
três são reais custa mais atenção do que economiza — quem lê aprende a ignorar.
Daí a triagem no passo 4 e a lista "o que não apontar".

**Contexto é o que custa dinheiro.** O diff é o objeto caro. Cada agente que o
carrega paga por ele. Por isso o pai **nunca carrega o diff** — ele passa o
*comando* adiante, e só dois revisores o leem, uma vez cada.

## Processo

### 1. Escopo, sem carregar o diff

```bash
BASE="${1:-main}"                                  # origin/main se a local divergir
git rev-parse "$BASE" >/dev/null || exit 1         # ref ruim falha aqui, não dentro dos agentes
git diff --stat "$BASE"...HEAD                     # só o resumo
git log --oneline "$BASE"..HEAD
```

Três pontos (`A...B`) compara contra o ancestral comum — mudança que entrou na
base depois da bifurcação não polui o diff.

**Não rode `git diff` sem `--stat` aqui.** O diff inteiro no seu contexto é a
maior fonte de custo desta skill, e ele já vai ser lido pelos revisores.

Diff vazio: diga e pare. Passou de ~1.500 linhas: **não fatie sozinho** —
diga o tamanho e pergunte por qual área começar. Fatiar automaticamente
multiplica o custo e, pior, separa arquivos que conversam entre si, perdendo
justamente o bug que atravessa dois arquivos.

### 2. Divergência da base (determinístico, sem agente)

```bash
MB=$(git merge-base "$BASE" HEAD)
git log --oneline "$MB".."$BASE" -- $(git diff --name-only "$BASE"...HEAD)
```

Commits aqui significam: **a base ganhou mudanças nos mesmos arquivos depois que
você bifurcou.** O merge vai conflitar, e a resolução preguiçosa pode desfazer
uma correção que já está na base. Se retornar algo, é achado — e sai de graça,
sem modelo.

### 3. As duas lentes

São **duas lentes**, não necessariamente dois agentes. Os subagentes existem por
economia de contexto — manter o diff fora do seu contexto para a triagem do
passo 4 sair barata —, não porque a revisão precise de duas cabeças.

**Se você tem subagente:** uma mensagem só, duas chamadas de Agent
(`general-purpose`). **Passe o comando do diff, não o conteúdo** — cada um roda
o `git diff` por conta própria, então o diff entra em dois contextos, não em
quatro. Enquanto eles rodam, **não abra arquivo nenhum**: você não tem o que
fazer até os dois voltarem, e investigar por conta própria carrega a superfície
do diff no seu contexto pela porta dos fundos, que é justamente o que este
desenho evita.

**Se você não tem subagente** (modelo ou runtime sem essa capacidade): leia o
diff **uma vez** e passe as duas lentes em sequência, na mesma sessão, com o
mesmo teto de 400 palavras cada. O resultado é o mesmo; o que muda é que o
contexto fica pesado para o passo 4 — então na triagem confie no que você já
leu em vez de reabrir os arquivos, e reabra só quando a nota depender de algo
que o diff não mostra.

Não improvise um terceiro caminho: sem subagente, é sequencial na mesma sessão.

Peça a cada um: achados com `arquivo:linha`, o que está errado, por quê.
**Teto de 400 palavras.** O teto não é só economia de saída: revisor com
orçamento curto prioriza, revisor sem orçamento diverga em minúcia.

**Revisor A — bugs.** Lê o diff e procura o que morde: condição invertida,
off-by-one, `null`/`undefined` não tratado, `await` faltando, erro engolido,
corrida, recurso não liberado, valor que vaza para onde não devia.

Dê a ele o resultado do passo 2 como contexto, se houver.

> Peça explicitamente que **siga o fio entre arquivos** quando um valor sai de um
> e chega em outro. Bug caro raramente cabe num arquivo só — o clássico é o
> getter que engole o erro e o chamador que trata o `null` como "não existe".

**Revisor B — regras do projeto.** Confere o diff contra as regras escritas do
repo — `CLAUDE.md` / `AGENTS.md`, da raiz e dos diretórios tocados — e
`.specs/capabilities/`, quando existirem. Duas perguntas:

1. Alguma regra escrita foi violada? **Cite a regra textualmente** — regra que
   não se consegue citar provavelmente não existe.
2. A mudança quebra algum cenário garantido em `.specs/capabilities/`? Esses
   arquivos dizem o que o sistema promete hoje; quebrar um em silêncio é a
   regressão mais cara que existe.
3. Conascência forte atravessando fronteira de feature/módulo? Valor mágico
   repetido em dois lugares (conascência de *significado*), ordem frágil de
   parâmetros posicionais (*posição*), algoritmo duplicado que precisa mudar
   junto (*algoritmo*) — aponte citando o tipo e a refatoração para a forma
   mais fraca (constante nomeada, objeto nomeado, fonte única). Dentro do
   mesmo módulo, tolere: conascência forte perto é menos smell que a mesma
   espalhada.

Sem os arquivos das perguntas 1 e 2, sobram a pergunta 3 e o bom senso:
convenção estabelecida no código vizinho vence preferência sua.

### 4. Triagem — você mesmo, sem agente novo

Você não carregou o diff, então está leve o bastante para julgar aqui. Um agente
a mais só para pontuar é custo que não se paga.

Para cada achado das duas fontes, dê 0 a 100:

- **0** — falso positivo, ou problema que já existia antes deste diff.
- **25** — pode ser real, não deu para confirmar.
- **50** — real e confirmado, mas nitpick ou raríssimo.
- **75** — real, confirmado, acontece na prática. Importa.
- **100** — certeza; a evidência confirma diretamente.

Confirme antes de pontuar alto: abra o arquivo citado e confira. Nota sem
evidência é palpite com número. Achado que cita regra do projeto exige conferir
que a regra diz aquilo mesmo.

**Fique com os ≥ 80.** Corte alto de propósito: o objetivo é que todo item que
sobra mereça ação, para que a lista seja lida em vez de escaneada.

### 5. Relatório

Escreva `code-review.md` (no diretório de artefatos, se houver; senão na raiz) e
termine com uma linha exatamente `REVIEW: LIMPO` ou `REVIEW: ACHADOS` — passo
automatizado depois costuma ler isso.

**Chamador que pedir outro nome de arquivo ou outra linha final manda**: escreva
no nome dele e feche com o marcador dele, em vez destes. O formato abaixo
continua valendo — o que muda é o rótulo, não o conteúdo. Sem isso, um nó de
pipeline com contrato próprio de artefato herdaria dois finais incompatíveis e
teria de escolher qual desobedecer.

```markdown
# Code review — <branch> vs <base>

<N> arquivo(s), <M> linha(s).

## Achados (<K>)

### 1. <o que está errado, em uma linha>
- **Onde**: `caminho/arquivo.ts:42`
- **Por quê**: <a razão, citando a regra ou a evidência>
- **Confiança**: 90

## Descartados na triagem (<J>)
<uma linha por item com a nota — mostra o que foi considerado e por que caiu>

REVIEW: ACHADOS
```

Na conversa devolva só o resumo: quantos achados, os títulos, o caminho do
arquivo. O relatório é para ser lido no arquivo, não colado no terminal.

## O que NÃO apontar

Isto é metade da qualidade da revisão. Não aponte:

- **O que lint, typecheck ou testes pegam.** Rodam no gate; comentar é ruído.
  Não rode build você mesmo.
- **Problema pré-existente**, em linha que este diff não tocou.
- **Cobertura de teste, spec não cumprida, teste fraco.** Em projeto com o fluxo
  spec-verify isso é do Verifier, que tem sensor de discriminação e rastreio por
  critério. Duplicar gera contradição entre as camadas.
- **Nitpick de estilo** que um sênior não levantaria numa revisão de verdade.
- **Preferência sua** contra convenção estabelecida do projeto.
- Mudança estranha mas **claramente intencional** dentro do escopo.
- Coisa silenciada de propósito no código (`eslint-disable` com motivo, etc.).

Na dúvida genuína, prefira não apontar: a revisão roda de novo no próximo diff,
mas confiança perdida nela não volta.

## Uso headless

Em pipeline não há quem responda. Então: não pergunte nada, escreva o relatório,
devolva o resumo. Diff vazio ou base inexistente: diga o motivo e encerre sem
erro. Diff grande demais: revise os arquivos de maior risco (banco, dinheiro,
autenticação, rotas públicas) e **registre no relatório o que ficou de fora** —
melhor um recorte honesto que um fatiamento caro.
