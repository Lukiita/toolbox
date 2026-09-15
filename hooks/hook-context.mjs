/**
 * What every hook needs before it decides anything: the repo root, whether this
 * file is the process entrypoint, and the project's hooks config with a safe
 * fallback. Shared so the three hooks cannot disagree on any of it.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repo root from git, not from this file's position: the hook runs from
 * the package under node_modules, and a hook fired from a subdirectory must
 * still find the project's toolbox.config.
 * @returns {string}
 */
export function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Whether `moduleUrl` is the file node was asked to run. Both sides go through
 * realpath: under pnpm (and any git dependency) `node_modules/@lukiita/toolbox`
 * is a symlink, `import.meta.url` is the real path and `process.argv[1]` the
 * link - compared as strings they never match and `main()` silently never ran,
 * which for a guard means fail-open (found in review, 2026-09-15).
 * @param {string} moduleUrl `import.meta.url` of the caller
 * @returns {boolean}
 */
export function isEntrypoint(moduleUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(path.resolve(argv1)) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/**
 * The project's `hooks` config. A hook must never crash on a broken or absent
 * config - a crash is fail-open for a guard and a red Stop for a reminder - so
 * any failure of the project's file (malformed, or a Node too old for `.ts`)
 * falls back to the canonical defaults, with the reason on stderr. The config
 * module itself is `dist/`, committed and shipped: if THAT import fails the
 * package is corrupted, and hiding it behind a copy of the defaults would be
 * one more copy to drift.
 * @returns {Promise<{watchedPatterns: RegExp[], exemptSuffixes: string[], protectedBranches: string[]}>}
 */
export async function hooksConfigOrDefaults() {
  const config = await import('../dist/config/index.mjs');
  try {
    // Only the `hooks` section is resolved: a shape error in `quality` must
    // not send this guard to the defaults (loop round 2). The feature slot
    // still travels, or a monorepo's watch list would be rebuilt from the
    // default `^src/` and watch nothing (loop round 3).
    const { quality, hooks } = await config.loadToolboxConfigPartial(repoRoot());
    const featureSlot = typeof quality?.featureSlot === 'string' ? quality.featureSlot : undefined;
    return config.resolveToolboxConfig({ quality: { featureSlot }, hooks }).hooks;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`toolbox hooks: using default config (${reason})\n`);
    return config.DEFAULT_HOOKS;
  }
}
