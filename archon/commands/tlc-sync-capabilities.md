---
description: Dobra o comportamento verificado de uma feature tlc no contrato vivo de .specs/capabilities/, com o gate mecânico do capabilities.py
---

A tlc feature just passed independent verification. Sync the durable
capability contract.

Feature slug: `$ARTIFACTS_DIR/.feature-slug`
(spec: `.specs/features/<slug>/spec.md`,
evidence: `.specs/features/<slug>/validation.md`).

Follow `.agents/skills/capability-sync/SKILL.md` — read it completely and
execute its sync process:
1. Fold ONLY the verified requirements (per the validation.md evidence
   table) into `.specs/capabilities/` — new requirement/scenario for new
   behavior, in-place rewrite for changed behavior, deletions only when
   the feature explicitly removed behavior from the product.
2. Capability content is written in English (`AGENTS.md`), with the two
   standing exceptions: Angolan regulatory terms (DUP, DAR, SICOEX, ASYCUDA
   World, *pauta aduaneira*, …) are never translated, and domain identifiers
   quoted from `src/domain/` keep their Portuguese names. Structural keywords
   (Requirement, Scenario, SHALL, WHEN, THEN) stay English. Capability names
   are domain nouns, never the feature slug.
3. Mechanical gate, must exit 0:
   `python3 .agents/skills/capability-sync/scripts/capabilities.py check`
4. Commit the capability changes (English conventional message, e.g.
   "docs(specs): sync capabilities for <slug>").

If the feature's verified behavior maps to no durable capability change
(pure refactor, internal-only change), say so explicitly and change
nothing — do not invent requirements.
