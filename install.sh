#!/usr/bin/env bash
#
# Installs the toolbox on this machine: links the global environment to this
# repo through symlinks. Idempotent - running it twice produces the same state.
#
# What it links (the product only - skills and hooks; the personal setup,
# AGENTS.md, Claude settings and subagents, lives in a private dotfiles repo
# with its own installer):
#   ~/.claude/skills    -> skills/            (Claude Code)
#   ~/.agents/skills    -> skills/            (canonical multi-agent path;
#                                              tlc, capability-sync and
#                                              pr-review-triage reference it)
#   ~/.agents/hooks     -> hooks/             (the global secrets guard)
#   ~/.codex/skills/<s> -> skills/<s>         (one link per skill: Codex keeps
#                                              its own .system/ in that dir, so
#                                              the dir itself cannot be a link)
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

# This repo's own git hooks (pre-commit keeps the committed dist/ in sync with
# src/). Plain core.hooksPath, not husky: a lifecycle script in package.json
# would run when the package is installed as a git dependency.
if git -C "$REPO_DIR" config core.hooksPath .githooks 2>/dev/null; then
  echo "hooks:  core.hooksPath -> .githooks"
else
  echo "WARNING: could not set core.hooksPath (not a git checkout, or dubious ownership) - run it by hand: git config core.hooksPath .githooks"
fi

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

echo "toolbox installed."
