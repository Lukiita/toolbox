# Upstream - tlc-spec-driven

- **Repo**: https://github.com/tech-leads-club/agent-skills (author: Felipe Rodrigues - felipfr; CC-BY-4.0)
- **Path there**: `packages/skills-catalog/skills/(development)/tlc-spec-driven/`
- **Vendored base here**: **3.3.0**, upstream commit `fe318be656b315d5b6f45cf7ea23946b2d0241b0`, on this repo's **`vendor/tlc-spec-driven`** branch (updated from 3.2.0 via 3-way merge on 2026-08-17)

## Local delta - why this copy differs from the base

1. **`capability-sync` integration** (born in project-b, Jul/2026): `.specs/capabilities/` in the structure, Verifier item (6) in SKILL.md, Step 11 + capability regression (2b) in validate.md, "Sync on PASS" tips. The `capability-sync` skill is ours - **it does not exist upstream**. Candidate for contribution as a new skill in their registry. Cross-skill references use the global `~/.agents/skills/capability-sync/` prefix (per-project installs swap the prefix).
2. **Verified-commit stamp** (project-b): item 2 of validate.md Step 9 - `**Commit verificado**` filled with `git log -1 --format=%H -- . ':!.specs'`, never raw HEAD; plus the matching tip. The archon flow depends on this field (`archon/commands/tlc-verify-feature.md`).
3. **Discuss trigger refinement** (project-b): a dimension being *present* does not trigger; a dimension being *unresolved* does (SKILL.md + discuss.md). Upstream still triggers on any present dimension. PR candidate.
4. **`penalize` guard in lessons.py** (project-b): only a `confirmed` lesson can be penalized - a candidate was never loaded as guidance, so it cannot have "failed when applied"; plus the matching sentence in lessons.md. PR candidate.
5. **`domain-modeling` bridges** (toolbox, 2026-08-17): `CONTEXT.md` and `docs/adr/` in Knowledge Chain Step 2; glossary in specify.md; ADRs + vocabulary in design.md; in memory.md, the "where the substance lives" rule (vocabulary → CONTEXT.md; a decision passing the three-part test → ADR with a pointer AD-NNN, in repos with an ADR directory). PR candidates in conditional form.
6. **"List Files Touched" tip** in design.md (project-b). PR candidate.
7. **Upstream router to grilling** (toolbox, 2026-08-18): specify.md suggests a `/grill-with-docs` session when clarification reveals the WHAT itself is contested (raw idea, tangled features), resuming Specify with the sharpened plan afterwards. Depends on toolbox-local skills (`grilling`, `grill-with-docs`, `domain-modeling`) - PR candidate only in conditional form, like item 5.
8. **Test seams in Design step 4** (toolbox, 2026-08-27): each component names the public interface its tests will observe it through, confirmed in the design review; the Tasks coverage matrix inherits them. Idea from mattpocock/skills `to-spec` (MIT). PR candidate.
9. **"No file paths or code in the spec" tip** in specify.md (toolbox, 2026-08-27), with the prototype-snippet exception. Idea from mattpocock/skills `to-spec`. PR candidate.
10. **Expand-contract tip** for wide refactors in tasks.md (toolbox, 2026-08-27): expand → migrate in batches → contract, as dependent tasks. Idea from mattpocock/skills `to-tickets`. PR candidate.

## Retired in the 3.3.0 update (upstream solved it better)

- The `~/.agents/skills/` prefix for the skill's own scripts → replaced by upstream's `<skill-dir>` resolution (issue #158).
- The diacritic fold in lessons.py `_norm` → superseded by the upstream fix (casefold + any-script + built-in selftest).
- The `pnpm` example in the tasks.md coverage matrix → back to the upstream example (illustrative only; the real one derives from the repo).

## How to update (3-way merge via the vendor branch)

1. Shallow-clone the upstream and extract the new version in this repo's layout:
   `git archive <commit> 'packages/skills-catalog/skills/(development)/tlc-spec-driven' | tar -x --strip-components=4 -C <tmp>`
2. On the `vendor/tlc-spec-driven` branch: replace `skills/tlc-spec-driven/` with the extracted content and commit
   `vendor: tlc-spec-driven X.Y.Z (upstream <full-hash>)`.
3. On `main`: `git merge vendor/tlc-spec-driven`. Git runs the 3-way against the base - the local delta survives on its own or conflicts in the open. **Read the full merge output (never truncated)** and clear the markers in ALL files before committing; when resolving, prefer the upstream form when it covers the same problem - **good delta is shrinking delta**.
4. Run the smoke tests: `python3 skills/tlc-spec-driven/scripts/lessons.py selftest` and each script's `--help`.
5. Update this file: new base, retired patches, new patches.
6. Push `main` **and** the vendor branch. `install.sh` does not need to run again (the symlinks already point here).

**Hard rule:** never edit the skill on the vendor branch - it is pure upstream, always. Every local patch happens on main. A patch useful to any user of the skill becomes an upstream issue/PR before becoming permanent delta here.
