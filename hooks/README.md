# hooks — provider-neutral agent guards

Canonical source of the coding-agent hooks, born in Project A. Imported per project (like `archon/` and `quality-gate/`), because hooks run inside a repo and their wiring lives in the repo's settings — with one exception: **`guard-bash-secrets.mjs` is global.** The installer links `~/.agents/hooks` → this directory and the shared `~/.claude/settings.json` wires the secrets rule for every session in every repo (it is the one universal rule; push rules stay per-project because branch flow varies). A project that also wires the full guard runs both — a double denial is harmless.

## The two hooks

| hook | event | severity | what it does |
|---|---|---|---|
| `guard-bash.mjs` | PreToolUse (Bash) | **deny** | closes the shell path to secrets (`cat .env`, `grep *.pem`…) that the provider's Read-deny cannot see, blocks `git push --force` without lease, blocks direct pushes to protected branches |
| `missing-tests-reminder.mjs` | Stop | warn only | lists changed files with logic and no co-located `.test.ts` — never blocks, no state, cannot loop |

`check-missing-tests.mjs` is the shared heuristic: the Stop hook imports it (warn) and **CI runs the same file as a blocking gate** (`node tools/agent-hooks/check-missing-tests.mjs --base <sha> --head <sha>`). One source of truth — if they diverged, agents and CI would disagree about what is required. The severity split is deliberate: mid-task the test may be one step away; at the pull request, it is not.

## Importing into a project

1. Copy the three files to `tools/agent-hooks/` (they resolve the repo root via git, so any directory works — keep them together).
2. Wire them in `.claude/settings.json` (versioned, not the `.local` one):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/tools/agent-hooks/guard-bash.mjs\"", "timeout": 10 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/tools/agent-hooks/missing-tests-reminder.mjs\"", "timeout": 30 }
        ]
      }
    ]
  }
}
```

3. Mirror the same block into `.codex/hooks.json` — the hooks are provider-neutral on purpose (they read the tool input from stdin and answer in the shared shape), so every agent family obeys the same guards.
4. CI: add the blocking counterpart —
   `node tools/agent-hooks/check-missing-tests.mjs --base "${{ github.event.pull_request.base.sha }}" --head "${{ github.sha }}"`.

## Adaptation points (review on import)

- `guard-bash.mjs` → `PROTECTED_BRANCHES` (default `main|develop`), and the secret rule's reason — name the project's real blast radius (the source project cited its Supabase `service_role` key bypassing RLS); a concrete reason lands harder than a generic one.
- `check-missing-tests.mjs` → `WATCHED_PATTERNS` (default: the same window as the quality ratchet's `RULE_PATTERNS` — `src/<feature>/domain|application/` and the flat legacy layout) and `EXEMPT_SUFFIXES`.

## Design rules these hooks follow (keep them when adding new ones)

- **Deny only what matches; let everything else fall through** to the provider's normal permission flow — a guard that over-blocks gets disabled, and then guards nothing.
- **A Stop hook warns, never blocks**: no `decision: block`, no state on disk, no counters — nothing that can loop.
- **Hook and CI share one heuristic file** when they check the same thing, warn early and block late.
