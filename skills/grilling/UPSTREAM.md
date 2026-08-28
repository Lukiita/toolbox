# Upstream - grilling

- **Repo**: https://github.com/mattpocock/skills (MIT), `skills/productivity/grilling/`
- **Vendored base**: 1.2.3, upstream commit `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`, on this repo's **`vendor/mattpocock-skills`** branch (shared by every skill imported from that repo; merge base recorded 2026-08-27)

## Local delta - a deliberate fork

Upstream rewrote the interview in v1.2.0 (PR #593) from one-question-at-a-time to **rounds**: it maps the decision tree and asks the whole *frontier* (every question whose prerequisites are already settled) in one numbered round. This copy keeps the pre-#593 body on purpose:

1. Lucas answers one thing at a time (AGENTS.md: "one idea at a time"); a round of ten questions is the bewildering thing the old text warned about.
2. `architecture-kata` borrows the one-question-at-a-time mechanic by contract (README, 2026-08-18): its think-first coaching needs the answer to Q1 before Q2 exists.

Kept from upstream's rewrite (2026-08-27): facts go to a sub-agent when one is available, so the lookup doesn't stall the interview and the questions that don't depend on it get asked meanwhile.

## How to update

Same procedure as tlc (`skills/tlc-spec-driven/UPSTREAM.md`), on the shared vendor branch. Expect the SKILL.md body to conflict on every sync: resolve toward this copy unless upstream restores a one-at-a-time mode.
