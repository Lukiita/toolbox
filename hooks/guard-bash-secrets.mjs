#!/usr/bin/env node
/**
 * GLOBAL PreToolUse (Bash) hook — the secrets rule alone, for every session in
 * every repo. Wired in the shared `~/.claude/settings.json` through the
 * `~/.agents/hooks` symlink the installer maintains; it runs from the toolbox
 * and is never copied into projects.
 *
 * Only the secrets rule is global because only it is universal: no project
 * wants a live credential pulled into the transcript. The push rules stay in
 * the per-project `guard-bash.mjs` — branch flow varies, secrets do not.
 * A project that also wires the full guard runs both; two denials of the same
 * command are harmless.
 */
import { denyIfViolated, readCommand, SECRET_RULE } from './guard-bash.mjs';

const command = readCommand();
if (command) denyIfViolated(command, [SECRET_RULE]);
