# Upstream - domain-modeling

- **Repo**: https://github.com/mattpocock/skills (MIT), `skills/engineering/domain-modeling/`. The copy arrived through the skills.sh aggregator in Jul/2026 with the source unconfirmed; a `diff -ru` against mattpocock/skills on 2026-08-27 settled it (identical outside the local delta below and upstream's repo-wide em-dash removal).
- **Vendored base**: 1.2.3, upstream commit `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`, on the shared **`vendor/mattpocock-skills`** branch. The merge base was recorded with `git merge -s ours` (main's tree untouched), so the next sync 3-way merges instead of arriving as unrelated history.

## Local delta

1. `metadata.origin` frontmatter and a description with more triggers.
2. Respect an existing ADR directory (`docs/en/adr/` wins over `docs/adr/`), in SKILL.md and ADR-FORMAT.md. PR candidate.
3. "Three memories, three jobs": the bridge between `CONTEXT.md`, `docs/adr/` and `.specs/STATE.md` AD-NNN. Toolbox-specific.

Cosmetic: upstream replaced every em-dash repo-wide (`.changeset/remove-em-dashes-repo-wide.md`); this copy still carries them. Expect that noise on the first sync and take upstream's punctuation.

## How to update

Same procedure as tlc (`skills/tlc-spec-driven/UPSTREAM.md`), on the shared vendor branch.
