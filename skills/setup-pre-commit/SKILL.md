---
name: setup-pre-commit
description: Wire the pre-commit and commit-msg hooks a repo is supposed to have — formatter on staged files, typecheck, Conventional Commits check — with Husky + lint-staged, and prove each hook bites before handing it back. Use when the user asks to set up pre-commit hooks, Husky, lint-staged, "formatar no commit", "validar mensagem de commit", or when a project shows no `.husky/` while AGENTS.md requires the formatter on pre-commit.
---

# Setup pre-commit

`AGENTS.md` requires the formatter wired to pre-commit. This installs that plus the two checks worth running before a commit exists: typecheck and the commit-message check. Tests stay out of the hook on purpose: a hook slow enough to annoy gets `--no-verify`, and then it protects nothing. The repo gate and the quality ratchet in CI are where the suite runs.

## Steps

### 1. Detect what exists

Package manager by lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `package-lock.json`; default npm). Existing `.husky/`, `.lintstagedrc*`, Prettier config, `typecheck` script. A tlc repo (`.specs/` present) also gets the commit-msg hook.

### 2. Install

Dev dependencies: `husky lint-staged prettier` (skip what is already there). Then `npx husky init`: it creates `.husky/` and the `prepare: "husky"` script.

### 3. `.husky/pre-commit`

```
npx lint-staged
<pm> run typecheck
```

No `typecheck` script? Omit the line and say so. Do not invent the script.

### 4. `.lintstagedrc`

```json
{ "*": "prettier --ignore-unknown --write" }
```

`--ignore-unknown` skips what Prettier cannot parse (images, lockfiles). Create `.prettierrc` only if none exists; otherwise keep the project's style.

### 5. `.husky/commit-msg` (tlc repos)

```
python3 "$(git rev-parse --show-toplevel)/.agents/skills/tlc-spec-driven/scripts/check_commit.py" "$1"
```

Prefer the in-repo copy of the script (it travels with the clone). Fall back to `~/.agents/skills/tlc-spec-driven/scripts/check_commit.py` when the project does not carry the skill, and say which one was used.

### 6. Prove each hook bites

A hook that never failed has never been tested:

1. Stage a file with broken formatting; run `sh .husky/pre-commit`; the file comes back formatted and the command exits 0. Unstage it.
2. Write `bad message` to a temp file; `sh .husky/commit-msg <file>` must exit non-zero. Write `feat: prove the hook` to it; must exit 0.
3. With a `typecheck` script: break a type on purpose, `sh .husky/pre-commit` must fail, revert.

Show the three results.

### 7. Hand back

`git status` of what was created or changed, plus a suggested commit message (`chore: wire pre-commit hooks (husky + lint-staged + typecheck)`). The user's own first commit is the end-to-end test. Do not commit on their behalf.

Shape borrowed from mattpocock/skills `setup-pre-commit` (MIT, 2026-08-27); the differences are deliberate: no tests in the hook, a commit-msg check, the prove-it-bites step, and no commit made by the skill.
