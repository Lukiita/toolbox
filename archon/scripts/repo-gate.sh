#!/usr/bin/env bash
#
# Repo gate (AGENTS.md): lint + typecheck + format + quality ratchet (which runs
# the suite with coverage).
#
# Bash, not an agent, and that is the design: `implement` already ends by
# running this same gate and fixing what breaks. An agent here would repeat the
# work and, worse, report the red honestly and let the pipeline continue — that
# is why a second deterministic gate used to sit right after it. One gate that
# is an `exit 1` does the job of both. Zero model cost.
#
# Called by the `validate` node. The `depends_on` stays in the YAML — what is
# common to every workflow is the script, not the edge in the graph.
set -euo pipefail

# A freshly created worktree has no node_modules: Archon creates the worktree
# and calls the nodes directly, with no setup step. Installing here is
# deterministic; without it the gate dies on "tsc: not found" (measured on run
# c4f50068, 2026-08-07).
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi

# One command, defined in package.json: the gate must be the same thing here,
# in AGENTS.md, in tlc's per-task gate and in CI. Repeating the sequence in
# each of those places is duplication that ages badly.
#
# `gate` = typecheck + lint + format:check + quality. `quality` runs the unit
# and contract suites with coverage and compares against the baseline, so it
# replaces `pnpm test` — adding both would run the suite twice.
pnpm gate

# NOTE — pgTAP: the project this came from ran `pnpm dlx supabase test db` when
# the diff touched `supabase/migrations/` or `supabase/tests/`. That block was
# removed here because there is no `supabase/` in the repo yet. When Supabase
# lands (ARCH-001: RLS is the isolation boundary between organizations, SEC-01
# and DATA-09), put the conditional block back — RLS nobody tests is RLS nobody
# knows is on:
#
#   if git diff --name-only "$BASE_BRANCH"...HEAD | grep -qE '^supabase/(migrations|tests)/'; then
#     pnpm dlx supabase test db
#   fi
#
# `$BASE_BRANCH` is injected by Archon into bash nodes.
