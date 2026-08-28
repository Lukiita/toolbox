#!/usr/bin/env bash
#
# Installs the toolbox on this machine: links the global environment to this
# repo through symlinks. Idempotent - running it twice produces the same state.
#
# What it links:
#   ~/.claude/skills    -> skills/            (Claude Code)
#   ~/.agents/skills    -> skills/            (canonical multi-agent path;
#                                              tlc, capability-sync and
#                                              pr-review-triage reference it)
#   ~/.agents/AGENTS.md -> agents/AGENTS.md   (agent-agnostic global rules)
#   ~/.agents/til       -> til/               (learning journal agents write to)
#   ~/.agents/katas     -> katas/             (architecture-kata practice output)
#   ~/.codex/AGENTS.md  -> agents/AGENTS.md
#   ~/.claude/CLAUDE.md -> claude/CLAUDE.md   (a one-line pointer to AGENTS.md)
#   ~/.claude/agents    -> claude/agents/     (Claude Code subagent definitions)
#   ~/.codex/skills/<s> -> skills/<s>         (one link per skill: Codex keeps
#                                              its own .system/ in that dir, so
#                                              the dir itself cannot be a link)
#
# settings.json is deliberately NOT a symlink: Claude Code rewrites that file
# on its own (e.g. /model saves into it), and an atomic write by the app would
# replace the link with a real file, silently breaking the single source.
# So: copy when absent; when present and divergent, show the diff and leave
# the decision to you.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

link() { # link <target-in-repo> <destination-in-home>
  local target="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [ -L "$dest" ]; then
    if [ "$(readlink -f "$dest")" = "$(readlink -f "$target")" ]; then
      echo "ok:     $dest"
      return
    fi
    rm "$dest"
  elif [ -e "$dest" ]; then
    local bak="$dest.pre-toolbox.$(date +%Y%m%d%H%M%S)"
    echo "backup: $dest -> $bak"
    mv "$dest" "$bak"
  fi
  ln -s "$target" "$dest"
  echo "link:   $dest -> $target"
}

link "$REPO_DIR/skills" "$HOME/.claude/skills"
link "$REPO_DIR/skills" "$HOME/.agents/skills"
link "$REPO_DIR/hooks" "$HOME/.agents/hooks"
link "$REPO_DIR/agents/AGENTS.md" "$HOME/.agents/AGENTS.md"
link "$REPO_DIR/agents/AGENTS.md" "$HOME/.codex/AGENTS.md"
link "$REPO_DIR/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
link "$REPO_DIR/til" "$HOME/.agents/til"
link "$REPO_DIR/katas" "$HOME/.agents/katas"
link "$REPO_DIR/claude/agents" "$HOME/.claude/agents"

# Codex discovers skills in ~/.codex/skills/, beside its own .system/ - so the
# directory stays real and each skill gets its own link. A skill removed from
# the repo would leave a dangling link behind, which Codex lists as broken.
for skill in "$REPO_DIR"/skills/*/; do
  skill="${skill%/}"
  link "$skill" "$HOME/.codex/skills/$(basename "$skill")"
done
for entry in "$HOME"/.codex/skills/*; do
  if [ -L "$entry" ] && [ ! -e "$entry" ]; then
    rm "$entry"
    echo "prune:  $entry (dangling)"
  fi
done

SETTINGS_REPO="$REPO_DIR/claude/settings.json"
SETTINGS_HOME="$HOME/.claude/settings.json"
if [ ! -e "$SETTINGS_HOME" ]; then
  cp "$SETTINGS_REPO" "$SETTINGS_HOME"
  echo "copy:   $SETTINGS_HOME (new)"
elif cmp -s "$SETTINGS_REPO" "$SETTINGS_HOME"; then
  echo "ok:     $SETTINGS_HOME"
else
  echo "WARNING: $SETTINGS_HOME diverges from the repo - resolve by hand (install never overwrites):"
  diff -u "$SETTINGS_HOME" "$SETTINGS_REPO" || true
fi

echo "toolbox installed."
