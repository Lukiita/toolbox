# Upstream - tlc-spec-driven

- **Repo**: https://github.com/tech-leads-club/agent-skills (autor: Felipe Rodrigues - felipfr; licença CC-BY-4.0)
- **Caminho lá**: `packages/skills-catalog/skills/(development)/tlc-spec-driven/`
- **Base vendorizada aqui**: **3.3.0**, commit upstream `fe318be656b315d5b6f45cf7ea23946b2d0241b0`, no branch **`vendor/tlc-spec-driven`** deste repo (atualizada de 3.2.0 por merge 3-way em 2026-08-17)

## Delta local - por que esta cópia difere da base

1. **Integração `capability-sync`** (nasceu no project-b, jul/2026): `.specs/capabilities/` na estrutura, item (6) do Verifier no SKILL.md, Step 11 + regressão de capacidade (2b) no validate.md, tips "Sync on PASS". A skill `capability-sync` é nossa - **não existe no upstream**. Candidata a ser contribuída como skill nova no registry deles. Referências cross-skill usam o prefixo global `~/.agents/skills/capability-sync/` (instalação por-projeto troca o prefixo).
2. **Carimbo do commit verificado** (project-b): item 2 do Step 9 do validate.md - `**Commit verificado**` preenchido com `git log -1 --format=%H -- . ':!.specs'`, nunca HEAD cru; + tip correspondente. O fluxo archon depende desse campo (`archon/commands/tlc-verify-feature.md`).
3. **Refinamento do gatilho de Discuss** (project-b): dimensão *presente* não dispara; dimensão *não resolvida* dispara (SKILL.md + discuss.md). O upstream ainda dispara em qualquer dimensão presente. Candidato a PR upstream.
4. **Guard do `penalize` no lessons.py** (project-b): só lição `confirmed` pode ser penalizada - candidata nunca foi carregada como guidance, logo não pode ter "falhado quando aplicada"; + frase correspondente no lessons.md. Candidato a PR upstream.
5. **Pontes com `domain-modeling`** (toolbox, 2026-08-17): `CONTEXT.md` e `docs/adr/` no Step 2 da Knowledge Chain; glossário no specify.md; ADRs + vocabulário no design.md; no memory.md, a regra "onde mora a substância" (vocabulário → CONTEXT.md; decisão que passa o teste triplo → ADR com AD-NNN de ponteiro, em repos com diretório de ADR). Candidatos a PR upstream em forma condicional.
6. **Tip "List Files Touched"** no design.md (project-b). Candidato a PR upstream.

## Aposentados no update para 3.3.0 (o upstream resolveu melhor)

- Prefixo `~/.agents/skills/` para scripts próprios → substituído pela resolução `<skill-dir>` do upstream (issue #158).
- Fold de diacríticos no `_norm` do lessons.py → superado pelo fix upstream (casefold + any-script + selftest embarcado).
- Exemplo com `pnpm` na matriz de cobertura do tasks.md → voltou ao exemplo upstream (era só ilustrativo; o real deriva do repo).

## Como atualizar (3-way merge via vendor branch)

1. Clone raso do upstream e extraia a versão nova no layout deste repo:
   `git archive <commit> 'packages/skills-catalog/skills/(development)/tlc-spec-driven' | tar -x --strip-components=4 -C <tmp>`
2. No branch `vendor/tlc-spec-driven`: substitua `skills/tlc-spec-driven/` pelo conteúdo extraído e commit
   `vendor: tlc-spec-driven X.Y.Z (upstream <hash-completo>)`.
3. No `main`: `git merge vendor/tlc-spec-driven`. O git faz o 3-way contra a base - o delta local sobrevive sozinho ou conflita às claras. **Leia a saída completa do merge (nunca truncada)** e zere os marcadores em TODOS os arquivos antes de commitar; ao resolver, prefira a forma upstream quando ela cobre o mesmo problema - **delta bom é delta que encolhe**.
4. Rode os smoke tests: `python3 skills/tlc-spec-driven/scripts/lessons.py selftest` e o `--help` de cada script.
5. Atualize este arquivo: nova base, patches aposentados, patches novos.
6. Push de `main` **e** do branch vendor. `install.sh` não precisa rodar de novo (os symlinks já apontam para cá).

**Regra dura:** nunca editar a skill no branch vendor - ele é upstream puro, sempre. Todo patch local acontece no main. Um patch que valha para qualquer usuário da skill vira issue/PR no upstream antes de virar delta permanente aqui.
