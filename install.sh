#!/usr/bin/env bash
#
# Instala o toolbox nesta máquina: liga o ambiente global a este repo por
# symlink. Idempotente — rodar duas vezes produz o mesmo estado.
#
# O que ele liga:
#   ~/.claude/skills    -> skills/            (Claude Code)
#   ~/.agents/skills    -> skills/            (caminho canônico multi-agente;
#                                              tlc, capability-sync e
#                                              pr-review-triage referenciam ele)
#   ~/.claude/CLAUDE.md -> claude/CLAUDE.md   (instruções globais)
#
# settings.json NÃO é symlink de propósito: o Claude Code reescreve esse
# arquivo sozinho (ex.: /model salva nele), e uma escrita atômica do app
# substituiria o link por arquivo real, quebrando a fonte única em silêncio.
# Então: copia quando não existe; quando existe e diverge, mostra o diff e
# deixa a decisão com você.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

link() { # link <alvo-no-repo> <destino-no-home>
  local alvo="$1" destino="$2"
  mkdir -p "$(dirname "$destino")"
  if [ -L "$destino" ]; then
    if [ "$(readlink -f "$destino")" = "$(readlink -f "$alvo")" ]; then
      echo "ok:     $destino"
      return
    fi
    rm "$destino"
  elif [ -e "$destino" ]; then
    local bak="$destino.pre-toolbox.$(date +%Y%m%d%H%M%S)"
    echo "backup: $destino -> $bak"
    mv "$destino" "$bak"
  fi
  ln -s "$alvo" "$destino"
  echo "link:   $destino -> $alvo"
}

link "$REPO_DIR/skills" "$HOME/.claude/skills"
link "$REPO_DIR/skills" "$HOME/.agents/skills"
link "$REPO_DIR/agents/AGENTS.md" "$HOME/.agents/AGENTS.md"
link "$REPO_DIR/agents/AGENTS.md" "$HOME/.codex/AGENTS.md"
link "$REPO_DIR/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"

SETTINGS_REPO="$REPO_DIR/claude/settings.json"
SETTINGS_HOME="$HOME/.claude/settings.json"
if [ ! -e "$SETTINGS_HOME" ]; then
  cp "$SETTINGS_REPO" "$SETTINGS_HOME"
  echo "copia:  $SETTINGS_HOME (novo)"
elif cmp -s "$SETTINGS_REPO" "$SETTINGS_HOME"; then
  echo "ok:     $SETTINGS_HOME"
else
  echo "AVISO:  $SETTINGS_HOME diverge do repo — resolva na mão (o install não sobrescreve):"
  diff -u "$SETTINGS_HOME" "$SETTINGS_REPO" || true
fi

echo "toolbox instalado."
