#!/usr/bin/env bash
#
# Portão determinístico do veredito: o contrato e o PR só acontecem para uma
# mudança cujo relatório PERSISTIDO aprova. Grep, não julgamento de modelo — um
# agente se convence de que está bom; um grep não.
#
# Uso:  verdict-gate.sh <caminho-do-relatorio> <tlc|fix>
#
# Os dois modos existem porque os dois verificadores escrevem formatos
# diferentes, e cada formato é lido pelo gate que o acompanha:
#
#   tlc  → `.specs/features/<slug>/validation.md`, linha `**Overall**: ✅ Ready`
#          (relatório versionado na branch, feito para ser lido por humano)
#   fix  → `$ARTIFACTS_DIR/verification.md`, linha `VERDICT: PASS`
#          (artefato de run, some com ela)
#
# Unificar os dois formatos seria mudança de contrato dos verificadores, não
# desduplicação — por isso o script aceita os dois em vez de forçar um.
set -euo pipefail

REPORT="${1:?uso: verdict-gate.sh <caminho-do-relatorio> <tlc|fix>}"
MODO="${2:?uso: verdict-gate.sh <caminho-do-relatorio> <tlc|fix>}"

if [ ! -f "$REPORT" ]; then
  echo "Sem relatório de verificação em $REPORT — o nó verify deve escrevê-lo." >&2
  exit 1
fi

case "$MODO" in
  tlc)
    APROVA='^\*\*Overall\*\*:.*✅ Ready'
    MOSTRA='^\*\*Overall\*\*:'
    CONTEXTO=0
    ;;
  fix)
    APROVA='^VERDICT: PASS'
    MOSTRA='^VERDICT:'
    CONTEXTO=20
    ;;
  *)
    echo "Modo desconhecido: '$MODO' (esperado 'tlc' ou 'fix')." >&2
    exit 1
    ;;
esac

if grep -Eq "$APROVA" "$REPORT"; then
  echo "verdict-gate ok: $REPORT aprova"
  exit 0
fi

echo "verdict-gate: $REPORT não aprova — parando antes do contrato / PR." >&2
grep -E -A"$CONTEXTO" "$MOSTRA" "$REPORT" >&2 || true
echo "" >&2
echo "Corrija as lacunas (veja o relatório) e retome com \`archon workflow resume <run-id>\`," >&2
echo "ou resolva interativamente. NÃO re-rode com \`workflow run\`: isso abre run nova e" >&2
echo "repaga a esteira inteira (ver .archon/WORKFLOWS.md)." >&2
exit 1
