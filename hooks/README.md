# hooks — provider-neutral agent guards

Canonical source of the coding-agent hooks, born in Project A. They ship inside the `@lukiita/toolbox` package and run from the project's `node_modules` (ADR-0001), because hooks run inside a repo and their wiring lives in the repo's settings — with one exception: **`guard-bash-secrets.mjs` is global.** The installer links `~/.agents/hooks` → this directory and the shared `~/.claude/settings.json` wires the secrets rule for every session in every repo (it is the one universal rule; push rules stay per-project because branch flow varies). A project that also wires the full guard runs both — a double denial is harmless.

## The two hooks

| hook | event | severity | what it does |
|---|---|---|---|
| `guard-bash.mjs` | PreToolUse (Bash) | **deny** | closes the shell path to secrets (`cat .env`, `grep *.pem`…) that the provider's Read-deny cannot see, blocks `git push --force` without lease, blocks direct pushes to protected branches |
| `missing-tests-reminder.mjs` | Stop | warn only | lists changed files with logic and no co-located `.test.ts` — never blocks, no state, cannot loop |

`check-missing-tests.mjs` is the shared heuristic: the Stop hook imports it (warn) and **CI runs the same file as a blocking gate** (`node node_modules/@lukiita/toolbox/hooks/check-missing-tests.mjs --base <sha> --head <sha>`). One source of truth — if they diverged, agents and CI would disagree about what is required. The severity split is deliberate: mid-task the test may be one step away; at the pull request, it is not.

## Importing into a project

The hooks ship inside the `@lukiita/toolbox` package (ADR-0001) — nothing is copied. With the package installed (see `templates/quality-gate/README.md`, step 1):

1. Wire them in `.claude/settings.json` (versioned, not the `.local` one):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/node_modules/@lukiita/toolbox/hooks/guard-bash.mjs\"", "timeout": 10 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/node_modules/@lukiita/toolbox/hooks/missing-tests-reminder.mjs\"", "timeout": 30 }
        ]
      }
    ]
  }
}
```

2. Mirror the same block into `.codex/hooks.json` — the hooks are provider-neutral on purpose (they read the tool input from stdin and answer in the shared shape), so every agent family obeys the same guards.
3. CI: add the blocking counterpart —
   `node node_modules/@lukiita/toolbox/hooks/check-missing-tests.mjs --base "${{ github.event.pull_request.base.sha }}" --head "${{ github.sha }}"`.

## Config (`toolbox.config.ts`, section `hooks`)

| field | default | what it drives |
| --- | --- | --- |
| `watchedPatterns` | `src/<feature>/domain\|application/` and the flat layout | files that must have a co-located test (the same window as the ratchet's rule places; edges are excluded on purpose — watching them would fail every PR that touches a screen) |
| `exemptSuffixes` | `.test.ts`, `.d.ts`, `.types.ts`, `.type.ts`, `.config.ts`, `.constants.ts`, `.fixtures.ts` | artefacts with no behaviour of their own |
| `protectedBranches` | `['main', 'develop']` | a direct `git push` to one of these is denied |

The secrets rule needs no config: it is universal, and `guard-bash-secrets.mjs` runs it globally from `~/.agents/hooks` for every repo.

## Design rules these hooks follow (keep them when adding new ones)

- **Deny only what matches; let everything else fall through** to the provider's normal permission flow — a guard that over-blocks gets disabled, and then guards nothing.
- **A Stop hook warns, never blocks**: no `decision: block`, no state on disk, no counters — nothing that can loop.
- **Hook and CI share one heuristic file** when they check the same thing, warn early and block late.
