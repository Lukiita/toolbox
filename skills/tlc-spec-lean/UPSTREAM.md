# Upstream - tlc-spec-lean

- **Repo**: https://github.com/tech-leads-club/agent-skills (Tech Leads Club; CC-BY-4.0), published at https://agent-skills.techleads.club/skills/tlc-spec-lean/
- **Path there**: `packages/skills-catalog/skills/(development)/tlc-spec-lean/`
- **Vendored base here**: **3.2.0**, extracted at upstream commit `586a794efa688358e456b942b1849b76672115ae` (2026-11-18, the commit that last changed the skill), on this repo's **`vendor/tlc-spec-lean`** branch (updated 2026-11-25; the previous base was 2.2.0 at `8658b66`)
- **Its own vendor branch**, not shared with `vendor/tlc-spec-driven` although the upstream repo is the same: the two skills sync on their own clocks.

Lean 3.x is Plan → Build → Review: one plan the user approves, the build slice by slice, then one review by a fresh sub-agent and one fix pass. Upstream dropped `checks.md`, the proofs, the completion gate and the lessons in 3.1.0 (`dd6878e`, "leave implementation to the model").

## Following 3.x - why (2026-11-25, decision by Lucas)

The 2.2.0 copy carried a large delta on the parts 3.x deleted: mutants in the Verifier, proofs that survive a `.specs/`-only commit, the lessons `penalize` guard, table parsing in the verification gate. A benchmark settled whether to keep it (its run logs stay outside this repo): 3 runs each of this copy and of upstream 3.2.0 (2 Opus, 1 Sonnet) on the same PRD, scored by a hidden 69-test acceptance suite and by Stryker on the tests each run wrote. Quality tied (69/69/68 against 69/69/69), test strength sat within run-to-run noise (mutation score 85% against 84% on average), and this copy cost about 1.43 times as much with half again as many `.specs/` lines to read. What held quality in both arms was the approved plan and a reviewer who did not write the code - which 3.x keeps. So the copy follows upstream, and the local delta is the glue to this toolbox's other skills, plus fixes that are candidates for an upstream PR.

## Local delta - why this copy differs from the base

Item 1 is retired (see "Retired after 3.2.0" below); the numbers stay, since script comments cite item 4.

2. **`domain-modeling` bridges**: Plan reads accepted ADRs (`docs/adr/`) as binding like an active `AD-NNN`, and writes criteria and Shape in `CONTEXT.md`'s terms (`plan.md`). `memory.md` admits an `AD-NNN` by the ADR's three-part test (a convention that fails it goes to `AGENTS.md`, as the global AGENTS.md and the `domain-modeling` skill say), sends vocabulary to `CONTEXT.md`, and makes the `AD-NNN` row a pointer, keeping its `Status`, when the substance lives in an ADR or another log. Upstream says "append there instead and do not start a second one", which fights its own `validate_plan.py`: the gate looks up the `AD-NNN` behind a `Differences from the source` row in `.specs/STATE.md` only. The pointer keeps both true. **PR candidate** (the contradiction). Was item 4.
3. **Upstream router to grilling**: `plan.md` suggests `/grill-with-docs` when the _what_ itself is contested, next to upstream's route for an open architectural bet. Depends on toolbox-local skills - PR candidate only in conditional form. Was item 5.
4. **`validate_plan.py` reads a None declaration and a table cell as written** (found 2026-11-24 on a Portuguese plan in project-e, issue #28). `validate_plan.py` passed a plan whose `## Surface` routes it never checked. `NONE_RE` (`\b(none|nothing|n/?a|single module)\b`) matched the Portuguese preposition "na" - the `/` was optional - and any "none" in a sentence, so the "no route rows" error was skipped; the plan also had an empty header table before the real one. `NONE_RE` now needs the declaration to open its line - markup (bullet, bold, `_italics_`, code span), a list number and the template's own label (`Or:`, `**Landing:**`) may come first - and `n/a` to keep its slash. Once the routes were read, a cell such as `SYNCED\|NOTHING_NEW` moved the columns: `split_row` now reads `\|` as a pipe inside a cell, as GFM does. Selftest: two cases (an empty header table plus "na" before the routes; a Surface whose prose says "none" mid-line) and seven controls (an escaped pipe in a Surface cell; None as a code span, in `_italics_`, after `**Landing:**`, numbered, as the template's `Or: None`; a Landing bullet that opens with "Nothing"), red on 3.2.0 only for the escaped pipe - the None controls keep the fix from going too far. Still open: `first_table` reads only the first table, so with an empty header table first the gate now fails (the safe side) with a misleading "no route rows". **PR candidate** - 3.2.0 still has both bugs.

Script patches carry a `Local patch (toolbox UPSTREAM.md item N)` comment, so a 3-way merge shows what they are.

## Retired after 3.2.0

| Item on the 3.2.0 base | Why it left |
| --- | --- |
| 1. `capability-sync` integration: Plan read `.specs/capabilities/`, the fix pass folded the criteria in (was item 3 on 2.2.0) | retired 2026-11-25, decision by Lucas. Across five projects, 84 capability regression checks found one real regression the suite missed (project-d, a closed registration back in the inspection queue), and it was tlc-spec-driven's Verifier probing the old guarantee that caught it. Lean 3.x's reviewer has a fixed prompt and runs no such check, so here the skill only added upkeep. `capability-sync` stays for tlc-spec-driven. Nothing updates a lean repo's `.specs/capabilities/` any more, yet `code-review` still reads it as the system's promises, so the `code-review` skill reads them only in a tlc-spec-driven repo, and a lean repo deletes the folder. |

## Retired at 3.2.0

| Item on the 2.2.0 base | Why it left |
| --- | --- |
| 1. Proofs survive a `.specs/`-only commit | `validate_verification.py` and `proofs.md` are gone upstream |
| 2. `penalize` guard in `lessons.py` | `lessons.py` is gone upstream |
| 6. Expand-contract tip in `build.md` | generic advice, not the skill's; it merged silently into the wrong section of 3.x's `build.md` |
| 7. Mutants in the Verifier | the Verifier is gone upstream, and the benchmark above showed no measurable gain in test strength for its cost |
| 8 and 9 (PR #29, never merged): table cells, None declarations, `## Findings` as GFM | written against 2.2.0's gates; the `validate_plan.py` part still applies to 3.2.0 and is item 4 above |

A feature started under the 2.2.0 copy - its folder holds `checks.md`, `proofs.md` or `verification.md` - finishes under that copy (the tag before this change) or restarts its build under 3.x from the approved plan; 3.x reads none of those files.

## tlc-spec-driven delta not carried - lean already covers it

| tlc-spec-driven item | Why it stays out |
| --- | --- |
| 3. Discuss trigger: an _unresolved_ dimension triggers, not a present one | lean asks every product decision before the plan is presented, with a recommendation |
| 6. `## Files Touched` in the design | contradicts lean's bet: no component catalogue, file placement is the builder's call; the Shape path (modules marked exists / new / door) answers "how big is this?" |
| 8. Test seams named per component | lean's rule 2: each rule lives where the repo's tests reach and has a test that fails if the rule is wrong |
| 9. No file paths or code in the spec | the plan names modules, not files, and keeps columns and types out; captures are files by design |
| Boundary test per component | the global AGENTS.md carries it for every agent |

## How to update

Same procedure as `skills/tlc-spec-driven/UPSTREAM.md` ("How to update"), with this skill's path and branch: `git archive <commit> 'packages/skills-catalog/skills/(development)/tlc-spec-lean' | tar -x --strip-components=4 -C <tmp>` - the files land in `<tmp>/tlc-spec-lean/`, so copy that folder, not `<tmp>`, to `skills/tlc-spec-lean/` - commit on `vendor/tlc-spec-lean` as `vendor: tlc-spec-lean X.Y.Z (upstream <full-hash>)`, then `git merge vendor/tlc-spec-lean` on main. The smoke test is `python3 -I skills/tlc-spec-lean/scripts/selftest.py`: it must end in `0 survived`, `controls ok` and `tooling ok`, the local cases included. The selftest is shared upstream with the plan and implement skills and skips the cases of scripts this skill does not ship.

**Hard rule:** never edit the skill on the vendor branch - it is pure upstream, always.
