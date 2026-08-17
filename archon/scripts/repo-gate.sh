#!/usr/bin/env bash
#
# Gate do repo (AGENTS.md): lint + typecheck + format + catraca de qualidade
# (que roda a suíte com cobertura).
#
# Bash, não agente, e isso é o desenho: o `implement` já termina rodando esse
# mesmo gate e consertando o que quebra. Um agente aqui repetiria o trabalho e,
# pior, relataria o vermelho honestamente e deixaria a esteira seguir — foi por
# isso que existia um segundo gate determinístico logo depois dele. Um gate só,
# que é `exit 1`, faz o serviço dos dois. Custo zero de modelo.
#
# Chamado pelo nó `validate`. O `depends_on` continua no YAML — o que é comum a
# todo workflow é o script, não a ligação no grafo.
set -euo pipefail

# Worktree recém-criado não tem node_modules: o Archon cria o worktree e chama
# os nós direto, sem passo de setup. Instalar aqui é determinístico; sem isto o
# gate morre em "tsc: not found" (medido na run c4f50068, 2026-08-07).
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi

# Um comando só, definido no package.json: o gate precisa ser a mesma coisa
# aqui, no AGENTS.md, no gate por task da tlc e no CI. Repetir a sequência em
# cada um desses lugares é duplicação que envelhece mal.
#
# `gate` = typecheck + lint + format:check + quality. O `quality` roda as suítes
# unit e contract com cobertura e ainda compara com o baseline, então ele
# substitui o `pnpm test` — somar os dois rodaria a suíte duas vezes.
pnpm gate

# NOTA — pgTAP: o projeto de origem rodava `pnpm dlx supabase test db` quando o
# diff tocava `supabase/migrations/` ou `supabase/tests/`. Aqui esse bloco foi
# removido porque ainda não existe `supabase/` no repo. Quando o Supabase
# entrar (ARCH-001: RLS é a fronteira de isolamento entre organizações, SEC-01
# e DATA-09), reponha o bloco condicional — RLS que ninguém testa é RLS que
# ninguém sabe se está ligada:
#
#   if git diff --name-only "$BASE_BRANCH"...HEAD | grep -qE '^supabase/(migrations|tests)/'; then
#     pnpm dlx supabase test db
#   fi
#
# `$BASE_BRANCH` é injetado pelo Archon nos nós bash.
