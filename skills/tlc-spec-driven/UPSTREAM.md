# Upstream — tlc-spec-driven

- **Repo**: https://github.com/tech-leads-club/agent-skills (autor: Felipe Rodrigues — felipfr; licença CC-BY-4.0)
- **Caminho lá**: `packages/skills-catalog/skills/(development)/tlc-spec-driven/`
- **Base vendorizada aqui**: **3.2.0**, commit upstream `bad8eeccd1c7cd0600ba2dfa0ee4489d3a577f35`, guardada pristine no branch **`vendor/tlc-spec-driven`** deste repo (amarrado ao main por merge de ancestralidade em 2026-08-17)

## Delta local — por que esta cópia difere da base

1. **Integração `capability-sync`** (nasceu no project-b, jul/2026): `.specs/capabilities/` na estrutura, item (6) do Verifier, Step 11 do validate, standalone fallback. A skill `capability-sync` é nossa — **não existe no upstream**. Candidata a ser contribuída como skill nova no registry deles.
2. **Refinamento do gatilho de Discuss** (project-b): "dimensão já resolvida por spec, convenção ou decisão registrada não é gray area". Genérico — candidato a PR upstream.
3. **Prefixo canônico de scripts `~/.agents/skills/` + parágrafo "Script paths"** (toolbox, 2026-08-17). O upstream resolveu o mesmo problema na 3.3.0 com `<skill-dir>/scripts/...` (commit `2a42c74`, issue #158) — **na próxima atualização, adotar a forma deles e aposentar este patch**.
4. **Pontes com `domain-modeling`** (toolbox, 2026-08-17): `CONTEXT.md` e `docs/adr/` no Step 2 da Knowledge Chain; glossário no specify.md; ADRs no design.md; promoção AD-NNN→ADR no memory.md. Candidatos a PR upstream em forma condicional ("if the repo keeps a glossary / an ADR directory…").

## Como atualizar (3-way merge via vendor branch)

1. Clone raso do upstream e extraia a versão nova no layout deste repo:
   `git archive <commit> 'packages/skills-catalog/skills/(development)/tlc-spec-driven' | tar -x --strip-components=4 -C <tmp>`
2. No branch `vendor/tlc-spec-driven`: substitua `skills/tlc-spec-driven/` pelo conteúdo extraído e commit
   `vendor: tlc-spec-driven X.Y.Z (upstream <hash-completo>)`.
3. No `main`: `git merge vendor/tlc-spec-driven`. O git faz o 3-way contra a base pristine — o delta local sobrevive sozinho ou conflita às claras. Ao resolver, prefira a forma upstream quando ela cobre o mesmo problema (ex.: item 3 acima) — **delta bom é delta que encolhe**.
4. Atualize este arquivo: nova base, patches aposentados, patches novos.
5. Push de `main` **e** do branch vendor. `install.sh` não precisa rodar de novo (os symlinks já apontam para cá).

**Regra dura:** nunca editar a skill no branch vendor — ele é upstream puro, sempre. Todo patch local acontece no main. Um patch que valha para qualquer usuário da skill vira issue/PR no upstream antes de virar delta permanente aqui.

## Pendente (visto em 2026-08-17, não aplicado)

Upstream 3.2.0 → main (~3.3.0+) traz: gates determinísticos com 4 scripts novos (`validate_spec.py`, `validate_tasks.py`, `check_commit.py`, `validate_state.py`), taxonomia EARS completa no specify, endurecimento do registro AD-NNN no memory.md, sensor de discriminação isolado do worktree real, resume reconciliado contra evidência git, fix de non-ASCII no lessons.py e a resolução de caminhos por `<skill-dir>`. Dois desses commits tocam `memory.md` e `specify.md` — arquivos com patch local (item 4), então o primeiro merge terá conflitos pequenos e esperados.
