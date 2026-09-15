#!/usr/bin/env node
/**
 * Provider-neutral PreToolUse (Bash) hook — denies commands that break repository rules.
 *
 * Complements each provider's permission system by closing the shell path where `cat .env`
 * could otherwise pull a live credential into the transcript. It also blocks history
 * rewrites on shared branches.
 *
 * It deliberately does NOT block `--no-verify`: the source project uses it for isolated
 * formatting commits, where letting the pre-commit hook run would fold a mechanical
 * reformat into the wrong commit. The rule there is discipline, not a guard.
 *
 * Only denies what matches; anything else falls through to the normal permission flow.
 *
 * The protected-branch list comes from the project's `toolbox.config.ts`
 * (`hooks.protectedBranches`, default main|develop). The secrets rule is universal and
 * needs no config - `guard-bash-secrets.mjs` imports just it, for every repo.
 */
import { readFileSync } from 'node:fs';

import { hooksConfigOrDefaults, isEntrypoint } from './hook-context.mjs';

// The .env suffix carries a negative lookahead: .env.example is committed on purpose and
// is exactly what the denial message points to.
const SECRET_FILES = String.raw`(\.env(\.(?!example|sample|template)[\w-]+)?(?![\w.-])|serviceAccount[\w-]*\.json|[\w-]*\.pem|[\w-]*\.key)`;
const READERS = String.raw`(cat|bat|less|more|head|tail|nl|strings|xxd|od|grep|rg|awk|sed|jq)`;

/**
 * Exported alone because this rule is universal - no project of ours wants a
 * live credential in the transcript. `guard-bash-secrets.mjs` applies just it
 * as a GLOBAL hook (user-level settings), while the push rules below stay
 * per-project: branch flow varies, secrets do not.
 */
export const SECRET_RULE = {
  pattern: new RegExp(String.raw`(^|[|;&]\s*)${READERS}\s+[^|;&]*${SECRET_FILES}`),
  reason:
    'These files hold live credentials. Reading one pulls it into the conversation, from where it can reach a log, a pull request or a summary. If you need the shape of the file, read .env.example or list only the key names.',
};

/** Universal like the secrets rule: no project of ours rewrites shared history. */
export const FORCE_PUSH_RULE = {
  pattern: /\bgit\s+push\b(?=[^|;&]*(--force(?!-with-lease)|\s-f\b))/,
  reason:
    'Force push rewrites shared history. Use --force-with-lease, which aborts if someone published after you.',
};

/**
 * The per-project rules: the branch flow is the only thing that varies. An empty
 * list means no protected branch - not "every branch": `\b()\b` matches anywhere
 * (found in review).
 * @param {readonly string[]} protectedBranches
 * @returns {{pattern: RegExp, reason: string}[]}
 */
export function pushRules(protectedBranches) {
  // An empty entry (`['main', '']`) would rebuild `\b(main|)\b` and deny every
  // push - the same hole as the empty list, one level down (review, round 2).
  const names = protectedBranches.filter((b) => typeof b === 'string' && b.trim() !== '');
  if (names.length === 0) return [FORCE_PUSH_RULE];
  const branches = names.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return [
    FORCE_PUSH_RULE,
    {
      pattern: new RegExp(String.raw`\bgit\s+push\b[^|;&]*\b(${branches})\b`),
      reason:
        'Pushing straight to a protected branch skips review. Open a pull request from a feature branch.',
    },
  ];
}

/**
 * The shell command from the hook's stdin (`tool_input.command`), or '' when
 * there is none - a hook must never crash on odd input.
 * @returns {string}
 */
export function readCommand() {
  try {
    const raw = readFileSync(0, 'utf-8');
    if (!raw.trim()) return '';
    return JSON.parse(raw)?.tool_input?.command ?? '';
  } catch {
    return '';
  }
}

/**
 * Writes the deny decision for the first rule the command violates.
 * @param {string} command
 * @param {readonly {pattern: RegExp, reason: string}[]} rules
 * @returns {boolean} whether a denial was written
 */
export function denyIfViolated(command, rules) {
  const violated = rules.find((rule) => rule.pattern.test(command));
  if (!violated) return false;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: violated.reason,
      },
    }),
  );
  return true;
}

async function main() {
  const command = readCommand();
  if (!command) return;
  // The universal rules first, with no config in the way: a broken config must
  // never turn `cat .env` into an allowed command (fail closed, found in review).
  if (denyIfViolated(command, [SECRET_RULE, FORCE_PUSH_RULE])) return;
  const { protectedBranches } = await hooksConfigOrDefaults();
  denyIfViolated(command, pushRules(protectedBranches));
}

// Entrypoint guard so `guard-bash-secrets.mjs` can import the rules without
// this file firing its full rule set on load.
if (isEntrypoint(import.meta.url)) await main();
