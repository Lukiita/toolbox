#!/usr/bin/env bash
#
# Shows how far a project's copies of the toolbox's per-project components have
# drifted from the source here. The symlinked parts (~/.agents/skills,
# AGENTS.md) can never drift; the copied parts - a project's .agents/skills/,
# tools/agent-hooks/, scripts/quality/, .archon/ - can, silently. This makes
# the drift visible. It changes nothing.
#
#   ./toolbox-diff.sh <project-root>
#
# Per file that differs: `+added -deleted` (git numstat, toolbox -> project)
# and a label:
#   adaptation point   the component README says this file is edited on
#                      import - a small diff is expected, a large one is a
#                      stale copy wearing an excuse
#   only in toolbox    not imported by design (docs, *.example.* templates,
#                      the global secrets guard), or missing from the project
#   only in project    the project added or kept something the toolbox lacks
# No label: the copy is simply behind (or ahead) - sync it one way.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${1:?usage: toolbox-diff.sh <project-root>}"
PROJECT="$(cd "$PROJECT" && pwd)"

PY_NOISE='__pycache__ *.pyc'
DRIFT_LINES=0

matches_any() { # matches_any <basename> "<glob> <glob> ..."
  local name="$1" glob
  set -f # split $2 on whitespace without expanding the globs against the cwd
  for glob in $2; do
    case "$name" in $glob) set +f; return 0 ;; esac
  done
  set +f
  return 1
}

numstat() { # numstat <toolbox-file> <project-file>  ->  "+A -D"
  # `git diff` exits 1 when the files differ, which is the whole point here.
  { git diff --no-index --numstat -- "$1" "$2" || true; } | awk '{ printf "+%s -%s", $1, $2 }'
}

report_line() { # report_line <relative-path> <counts> <label>
  DRIFT_LINES=$((DRIFT_LINES + 1))
  printf '    %-46s %-11s %s\n' "$1" "$2" "$3"
}

# Named through the environment on purpose: five positional parameters would be
# connascence of position. ADAPTED / SKIP / ROOT_FILES are basename globs.
compare_toolbox_side() { # compare_toolbox_side <src-dir> <dst-dir>
  local src="$1" dst="$2" file rel name target label
  while IFS= read -r file; do
    rel="${file#"$src"/}"
    name="$(basename "$file")"
    if matches_any "$name" "${SKIP:-}"; then continue; fi
    target="$dst/$rel"
    if matches_any "$name" "${ROOT_FILES:-}"; then target="$PROJECT/$name"; rel="$rel (project root)"; fi
    if [ ! -e "$target" ]; then report_line "$rel" "" "only in toolbox"; continue; fi
    if cmp -s "$file" "$target"; then continue; fi
    label=""
    if matches_any "$name" "${ADAPTED:-}"; then label="adaptation point"; fi
    report_line "$rel" "$(numstat "$file" "$target")" "$label"
  done < <(find "$src" -type f | sort)
}

compare_project_side() { # compare_project_side <src-dir> <dst-dir>
  local src="$1" dst="$2" file rel
  while IFS= read -r file; do
    rel="${file#"$dst"/}"
    if matches_any "$(basename "$file")" "${SKIP:-}"; then continue; fi
    if [ ! -e "$src/$rel" ]; then report_line "$rel" "" "only in project"; fi
  done < <(find "$dst" -type f | sort)
}

compare_tree() { # compare_tree <src-dir> <dst-dir>   (reads ADAPTED, SKIP, ROOT_FILES; caller prints the heading)
  local src="$1" dst="$2" before
  if [ ! -d "$dst" ]; then printf '    (not imported)\n'; return; fi
  before="$DRIFT_LINES"
  compare_toolbox_side "$src" "$dst"
  compare_project_side "$src" "$dst"
  if [ "$DRIFT_LINES" -eq "$before" ]; then printf '    identical\n'; fi
}

compare_skills() { # every skill the project carries a copy of
  local dir name
  printf '== skills  (.agents/skills/ in the project)\n'
  if [ ! -d "$PROJECT/.agents/skills" ]; then printf '  (none)\n'; return; fi
  for dir in "$PROJECT"/.agents/skills/*/; do
    name="$(basename "$dir")"
    if [ -d "$REPO_DIR/skills/$name" ]; then
      printf '  %s\n' "$name"
      SKIP="$PY_NOISE" compare_tree "$REPO_DIR/skills/$name" "${dir%/}"
    else
      printf '  %s\n    project-local skill (not in the toolbox)\n' "$name"
    fi
  done
}

printf 'toolbox: %s\nproject: %s\n\n' "$REPO_DIR" "$PROJECT"
compare_skills
printf '== hooks  -> tools/agent-hooks/\n'
ADAPTED='guard-bash.mjs check-missing-tests.mjs' SKIP='README.md guard-bash-secrets.mjs' \
  compare_tree "$REPO_DIR/hooks" "$PROJECT/tools/agent-hooks"
printf '== quality-gate  -> scripts/quality/  (vitest.quality.config.ts at the project root)\n'
ADAPTED='place-rule.mts size.mts complexity.mts cycles.mts gate.mts locale.mts vitest.quality.config.ts' \
  SKIP='README.md *.example.*' ROOT_FILES='vitest.quality.config.ts' \
  compare_tree "$REPO_DIR/quality-gate" "$PROJECT/scripts/quality"
printf '== archon  -> .archon/\n'
ADAPTED='README.md WORKFLOWS.md config.yaml repo-gate.sh' SKIP="$PY_NOISE" \
  compare_tree "$REPO_DIR/archon" "$PROJECT/.archon"
