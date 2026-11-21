// What a person types to `toolbox install`, in one place: the flags and the
// skill names. The CLI only reads argv; what it means is decided - and
// tested - here.
/** Every skill the package ships. */
export const ALL_FLAG = '--all';
/**
 * Write a merge that left conflicts. Named once: the install line that
 * suggests the flag reads it from here, so the hint cannot outlive a rename.
 */
export const WRITE_CONFLICTS_FLAG = '--write-conflicts';
const FLAGS = [ALL_FLAG, WRITE_CONFLICTS_FLAG];
/** A mistake in what was typed; the CLI answers with exit code 2. */
export class InstallUsageError extends Error {
}
/**
 * Reads `toolbox install [--all] [--write-conflicts] [<skill>...]`.
 *
 * @example
 *   parseInstallArguments(['code-review', '--write-conflicts'])
 *   // => { names: ['code-review'], all: false, writeConflicts: true }
 */
export function parseInstallArguments(args) {
    const flags = args.filter((arg) => arg.startsWith('--'));
    // A mistyped flag fails instead of being ignored.
    const unknown = flags.find((flag) => !FLAGS.includes(flag));
    if (unknown !== undefined)
        throw new InstallUsageError(`unknown argument: ${unknown}`);
    return {
        names: args.filter((arg) => !arg.startsWith('--')),
        all: flags.includes(ALL_FLAG),
        writeConflicts: flags.includes(WRITE_CONFLICTS_FLAG),
    };
}
/**
 * The skills the package ships, one per line with a line about each: what a
 * script or an agent is shown when a project has no skill yet and named none.
 * (A person at a terminal gets the picker, `skill-picker.mts`.)
 *
 * @example
 *   catalogLines(catalog, '2.0.0').forEach((line) => console.error(line))
 */
export function catalogLines(catalog, version) {
    const width = Math.max(...catalog.map((entry) => entry.name.length));
    const rows = catalog.map(({ name, summary }) => `  ${name.padEnd(width)}   ${summary}`.trimEnd());
    return [`Skills in @lukiita/toolbox ${version}:`, ...rows];
}
