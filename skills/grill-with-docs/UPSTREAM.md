# Upstream - grill-with-docs

- **Repo**: https://github.com/mattpocock/skills (MIT), `skills/engineering/grill-with-docs/`
- **Vendored base**: 1.2.3, upstream commit `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`, on the shared **`vendor/mattpocock-skills`** branch (merge base recorded 2026-08-27)

## Local delta

None. Aligned 2026-08-27: the body now uses upstream's "Call the Skill tool twice" wording, which names the tool the harness actually exposes instead of a `/name` the model has to interpret as a command. The composition it expresses (`grilling` + `domain-modeling`) resolves to this toolbox's copies of both, so the deliberate fork in `grilling` (one question at a time) carries through.

## How to update

Same procedure as tlc (`skills/tlc-spec-driven/UPSTREAM.md`), on the shared vendor branch.
