# Upstream - writing-for-agents

- **Repo**: https://github.com/mattpocock/skills (MIT), `skills/productivity/writing-for-agents/`
- **Vendored base**: 1.2.3, upstream commit `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`, on the shared **`vendor/mattpocock-skills`** branch (imported 2026-08-27)

## Local delta

1. `metadata.origin` frontmatter.

Nothing else. It complements Anthropic's `skill-creator` (not carried here): that one measures a skill (evals, size limits); this one says what to change (pointer wording, the two loads, leading words, no-op pruning). `SKILL-MECHANICS.md` is the reference for deciding, per skill, whether it should be user-invoked (`disable-model-invocation: true`, zero context load) or model-invoked.

## How to update

Same procedure as tlc (`skills/tlc-spec-driven/UPSTREAM.md`), on the shared vendor branch.
