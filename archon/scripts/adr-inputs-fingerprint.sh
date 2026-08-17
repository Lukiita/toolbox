#!/usr/bin/env bash
# Impressão digital das entradas que decidem um conflito entre a spec e um ADR
# aceito: a spec da feature e as decisões em `docs/en/adr/`.
#
# Dois nós do tlc-apply-feature usam isto. O `verify-feature` grava a digital
# ANTES do implement; o `adr-gate` recomputa DEPOIS e compara. Digital diferente
# significa que spec ou ADR mudaram desde que o conflito foi registrado — o
# marcador `.adr-conflict` ficou velho e quem precisa reavaliar é o implement,
# que o `--resume` não re-executa.
#
# Mora num script só, e não inline nos dois nós, porque duas cópias da mesma
# lógica de hash divergem com o tempo — e divergir aqui reintroduz exatamente o
# bug do marcador velho que ela existe para pegar.
#
# Uso: .archon/scripts/adr-inputs-fingerprint.sh <slug-da-feature>
set -euo pipefail

SLUG="${1:?uso: adr-inputs-fingerprint.sh <slug-da-feature>}"

ENTRADAS=()
if [ -d docs/en/adr ]; then
  ENTRADAS+=(docs/en/adr)
fi
if [ -d ".specs/features/$SLUG" ]; then
  ENTRADAS+=(".specs/features/$SLUG")
fi

# Projeto sem ADR e sem spec no disco: digital constante, e o gate compara
# constante com constante. Não inventa diferença onde não há entrada.
if [ ${#ENTRADAS[@]} -eq 0 ]; then
  echo "sem-entradas"
  exit 0
fi

# O nome do arquivo entra no hash (o sha256sum imprime nome ao lado do digest),
# então renomear ou remover um ADR muda a digital — não só editar o conteúdo.
find "${ENTRADAS[@]}" -type f -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 -r sha256sum \
  | sha256sum \
  | cut -d' ' -f1
