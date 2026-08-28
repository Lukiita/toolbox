# Upstream - codebase-design

- **Repo**: https://github.com/mattpocock/skills (MIT), `skills/engineering/codebase-design/`
- **Vendored base**: 1.2.3, upstream commit `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`, on the shared **`vendor/mattpocock-skills`** branch (imported 2026-08-27)

## Local delta

1. `metadata.origin` frontmatter.

Nothing else: it is a glossary, and the vocabulary already fits the house rules. It reserves *boundary* for DDD's bounded context and says *seam* for the place a test or adapter plugs in, which is exactly the split AGENTS.md needs. Consumers here: `arch-review` (depth lens and survey mode) and `diagnosing-bugs` (the seam for a regression test).

## How to update

Same procedure as tlc (`skills/tlc-spec-driven/UPSTREAM.md`), on the shared vendor branch.
