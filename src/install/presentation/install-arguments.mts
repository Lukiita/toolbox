// What a person types to `toolbox install`, in one place: the flags, the
// skill names, and the answer to "which skills?" when a terminal asks. The
// CLI only reads argv and stdin; what they mean is decided - and tested - here.

import type { CatalogEntry, SkillSelection } from '../application/install-skills.mts';

/** Every skill the package ships. */
export const ALL_FLAG = '--all';
/**
 * Write a merge that left conflicts. Named once: the install line that
 * suggests the flag reads it from here, so the hint cannot outlive a rename.
 */
export const WRITE_CONFLICTS_FLAG = '--write-conflicts';

const FLAGS: readonly string[] = [ALL_FLAG, WRITE_CONFLICTS_FLAG];

/** A mistake in what was typed; the CLI answers with exit code 2. */
export class InstallUsageError extends Error {}

export interface InstallArguments extends SkillSelection {
  writeConflicts: boolean;
}

/**
 * Reads `toolbox install [--all] [--write-conflicts] [<skill>...]`.
 *
 * @example
 *   parseInstallArguments(['code-review', '--write-conflicts'])
 *   // => { names: ['code-review'], all: false, writeConflicts: true }
 */
export function parseInstallArguments(args: readonly string[]): InstallArguments {
  const flags = args.filter((arg) => arg.startsWith('--'));
  // A mistyped flag fails instead of being ignored.
  const unknown = flags.find((flag) => !FLAGS.includes(flag));
  if (unknown !== undefined) throw new InstallUsageError(`unknown argument: ${unknown}`);
  return {
    names: args.filter((arg) => !arg.startsWith('--')),
    all: flags.includes(ALL_FLAG),
    writeConflicts: flags.includes(WRITE_CONFLICTS_FLAG),
  };
}

/**
 * The list a person picks from, when a project has no skill yet and named none.
 *
 * @example
 *   selectionMenu(catalog, '2.0.0').forEach((line) => console.log(line))
 */
export function selectionMenu(catalog: readonly CatalogEntry[], version: string): string[] {
  const width = Math.max(...catalog.map((entry) => entry.name.length));
  const rows = catalog.map(({ name, summary }, index) =>
    `  ${String(index + 1).padStart(2)}. ${name.padEnd(width)}   ${summary}`.trimEnd(),
  );
  return [
    `Skills in @lukiita/toolbox ${version}:`,
    ...rows,
    'Which ones does this project get? Numbers or names, separated by spaces; or "all".',
  ];
}

function skillOf(token: string, names: readonly string[]): string {
  const byNumber = /^\d+$/.test(token) ? names[Number(token) - 1] : undefined;
  const name = byNumber ?? names.find((candidate) => candidate === token);
  if (name !== undefined) return name;
  throw new InstallUsageError(
    `not a skill of the list: received ${JSON.stringify(token)}, expected a number from 1 to ${names.length} or one of ${names.join(', ')}`,
  );
}

/**
 * Reads the answer to the selection menu.
 *
 * @example
 *   parseSelection('1 retro', ['code-review', 'ddd-tactical', 'retro'])
 *   // => { names: ['code-review', 'retro'], all: false }
 */
export function parseSelection(answer: string, names: readonly string[]): SkillSelection {
  const tokens = answer.split(/[\s,]+/).filter((token) => token !== '');
  if (tokens.includes('all')) return { names: [], all: true };
  return { names: [...new Set(tokens.map((token) => skillOf(token, names)))], all: false };
}
