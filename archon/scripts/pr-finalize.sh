#!/usr/bin/env bash
#
# Fecho do workflow que abre PR: corrige a base se ela saiu errada, imprime o PR
# e **diz qual é o próximo comando**.
#
# Nasceu compartilhado por três `finalize` — o bloco de re-target era idêntico
# nos três (medido, não suposto; o que diferia era só a lista de artefatos, que
# continua no YAML de cada um). Mesma extração do `repo-gate.sh` e do
# `verdict-gate.sh`. Desde 04/08 o único chamador é o `tlc-apply-feature`: os
# outros saíram da branch para o piloto e voltam um por PR (Backlog do
# `.archon/README.md`). O script segue genérico de propósito — é para eles
# reusarem na volta, não para cada um trazer uma cópia de novo.
#
# Por que existe um handoff, e por que ele não é um nó:
#
# O ciclo de revisão NÃO fecha quando o PR abre. O CodeRabbit revisa de forma
# assíncrona e em várias passadas — medido na PR #39: seis reviews ao longo de
# 9h46m, a primeira 13 minutos depois da criação e a última quase 10 horas
# depois, disparada por um push novo. Não existe um instante "a review
# terminou" para um nó aguardar: esperar a primeira pendura a run por 13
# minutos e ainda assim perde as outras.
#
# (Tentar resolver isso dentro da run já foi tentado por dois caminhos, os dois
# removidos: o CLI do CodeRabbit antes do PR, que pendurava a run e no limite
# do plano saía com exit 0 sem revisar nada; e um laço que esperava a review
# dentro da run. Ver .archon/WORKFLOWS.md.)
#
# Durante o piloto do `tlc-apply-feature`, o tratamento dos achados é
# MANUAL. Houve um `tlc-pr-findings` fazendo essa rodada; ele saiu da branch
# em 2026-08-04 junto com os outros fluxos não testados, e volta como skill
# depois que a linha dourada estiver provada — ver docs/plano-fluxo-tlc.md.
#
# Precisa de $BASE_BRANCH no ambiente (o Archon injeta nos nós bash, e o script
# herda de quem o chamou).
set -euo pipefail

HEAD_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# O número vem de QUEM ABRIU o PR, não de uma busca: o `create-pr` grava o que
# ele criou. A busca por branch é o fallback para quem chamar este script fora
# de uma run — e ali ela exige resposta única.
#
# Por que a unicidade importa aqui e não seria preciosismo: o GitHub permite
# mais de um PR aberto da mesma head para BASES diferentes, e a primeira coisa
# que este script faz é MUDAR A BASE. Um `.[0]` num par desses re-aponta o PR
# errado — e o dano é justamente o que o script existe para consertar.
PR_NUMBER=""
if [ -n "${ARTIFACTS_DIR:-}" ] && [ -s "$ARTIFACTS_DIR/.pr-number" ]; then
  PR_NUMBER=$(tr -d '[:space:]' < "$ARTIFACTS_DIR/.pr-number")
fi

if [ -z "$PR_NUMBER" ]; then
  # Atribuição, não pipe: sob `set -e` a falha do `gh` derruba o script aqui.
  # Deixá-la virar lista vazia transformaria erro de API em "nenhum PR aberto",
  # que é uma mentira de infraestrutura vestida de veredito.
  PR_LIST=$(gh pr list --head "$HEAD_BRANCH" --state open --json number -q '.[].number')
  # Linha a linha, com aspas (SC2206). `MATCHES=($PR_LIST)` sofreria word
  # splitting e glob — inofensivo para os inteiros que a API devolve, mas quem
  # ler depois teria que re-derivar essa garantia. Sai mais barato não depender
  # dela. O `-n` mantém o caso vazio em zero elementos, que é o que o ramo `0`
  # espera: `<<<` sobre string vazia produz uma linha.
  MATCHES=()
  while IFS= read -r linha; do
    [ -n "$linha" ] && MATCHES+=("$linha")
  done <<< "$PR_LIST"
  case ${#MATCHES[@]} in
    0)
      echo "Nenhum PR aberto para a branch $HEAD_BRANCH" >&2
      exit 1
      ;;
    1)
      PR_NUMBER=${MATCHES[0]}
      ;;
    *)
      echo "Mais de um PR aberto para a branch $HEAD_BRANCH: ${MATCHES[*]}" >&2
      echo "Este script re-aponta a base — escolher um deles no chute mexeria no PR errado." >&2
      echo "Feche os que sobram, ou grave o número certo em \$ARTIFACTS_DIR/.pr-number." >&2
      exit 1
      ;;
  esac
fi

ACTUAL=$(gh pr view "$PR_NUMBER" --json baseRefName -q '.baseRefName')
if [ "$ACTUAL" != "$BASE_BRANCH" ]; then
  echo "Base errada no PR #$PR_NUMBER: esperada=$BASE_BRANCH atual=$ACTUAL — corrigindo" >&2
  gh pr edit "$PR_NUMBER" --base "$BASE_BRANCH"
fi

# Atribuir antes de imprimir: `echo "$(gh pr view …)"` devolve o status do
# `echo`, então o `set -e` não vê a falha do `gh` e o fecho segue anunciando
# sucesso com a linha do PR em branco.
PR_URL=$(gh pr view "$PR_NUMBER" --json url -q '.url')
echo "  PR:         $PR_URL"
echo ""
echo "── o ciclo ainda não fechou ──"
echo "  A revisão externa é assíncrona e vem em várias passadas. O CodeRabbit"
echo "  comenta sozinho no PR alguns minutos depois do push."
echo ""
echo "  O tratamento dos achados é MANUAL durante o piloto: leia os comentários"
echo "  no PR e trate numa sessão interativa. Dois lembretes que valem tanto"
echo "  para gente quanto valiam para o fluxo que fazia isso:"
echo ""
echo "    - o endpoint de comentários inline NÃO traz tudo. Achado que o"
echo "      CodeRabbit não consegue prender a uma linha do diff vira texto no"
echo "      corpo da review, sob 'Outside diff range comments (N)'. Medido na"
echo "      PR #39: 2 de 4 achados só existiam ali."
echo "    - recusar achado com motivo escrito na thread é melhor que corrigir"
echo "      para zerar contador. Perseguir 'zero comentários' produz conserto"
echo "      de não-problema."
