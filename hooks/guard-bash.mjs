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
 * Adapt on import: the protected-branch list, and the first rule's reason — name the
 * project's actual blast radius (the source project cited its Supabase service_role key
 * bypassing RLS). A concrete reason lands harder than a generic one.
 */
import { readFileSync } from 'node:fs';

// The .env suffix carries a negative lookahead: .env.example is committed on purpose and
// is exactly what the denial message points to.
const SECRET_FILES = String.raw`(\.env(\.(?!example|sample|template)[\w-]+)?(?![\w.-])|serviceAccount[\w-]*\.json|[\w-]*\.pem|[\w-]*\.key)`;
const READERS = String.raw`(cat|bat|less|more|head|tail|nl|strings|xxd|od|grep|rg|awk|sed|jq)`;

const PROTECTED_BRANCHES = String.raw`(main|develop)`;

const RULES = [
  {
    pattern: new RegExp(String.raw`(^|[|;&]\s*)${READERS}\s+[^|;&]*${SECRET_FILES}`),
    reason:
      'These files hold live credentials. Reading one pulls it into the conversation, from where it can reach a log, a pull request or a summary. If you need the shape of the file, read .env.example or list only the key names.',
  },
  {
    pattern: /\bgit\s+push\b(?=[^|;&]*(--force(?!-with-lease)|\s-f\b))/,
    reason:
      'Force push rewrites shared history. Use --force-with-lease, which aborts if someone published after you.',
  },
  {
    pattern: new RegExp(String.raw`\bgit\s+push\b[^|;&]*\b${PROTECTED_BRANCHES}\b`),
    reason:
      'Pushing straight to a protected branch skips review. Open a pull request from a feature branch.',
  },
];

function readCommand() {
  try {
    const raw = readFileSync(0, 'utf-8');
    if (!raw.trim()) return '';
    return JSON.parse(raw)?.tool_input?.command ?? '';
  } catch {
    return '';
  }
}

function main() {
  const command = readCommand();
  if (!command) return;

  const violated = RULES.find((rule) => rule.pattern.test(command));
  if (!violated) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: violated.reason,
      },
    }),
  );
}

main();
