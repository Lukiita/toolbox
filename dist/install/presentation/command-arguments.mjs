// What a person types to `toolbox install` and `toolbox skills`, in one
// place: the flags and the skill names. The CLI only reads argv; what it
// means is decided - and tested - here. Both commands refuse what they do not
// know through the same check and the same error: read in two places, the
// check was written twice and threw two different classes (found in review).
import { SkillCommandUsageError } from "../application/usage-error.mjs";
/** `toolbox install`: every skill the package ships. */
export const ALL_FLAG = '--all';
/**
 * `toolbox install`: write a merge that left conflicts. Named once: the
 * install line that suggests the flag reads it from here, so the hint cannot
 * outlive a rename.
 */
export const WRITE_CONFLICTS_FLAG = '--write-conflicts';
/** `toolbox skills`: print the diffs behind each state. */
export const DIFF_FLAG = '--diff';
const isFlag = (arg) => arg.startsWith('--');
// A mistyped flag fails instead of being ignored: `--write-conflict` read as
// "no flag" would leave the conflict unwritten and say nothing.
function assertKnown(args, known) {
    const unknown = args.find((arg) => !known.includes(arg));
    if (unknown !== undefined)
        throw new SkillCommandUsageError(`unknown argument: ${unknown}`);
}
/**
 * Reads `toolbox install [--all] [--write-conflicts] [<skill>...]`.
 *
 * @example
 *   parseInstallArguments(['code-review', '--write-conflicts'])
 *   // => { names: ['code-review'], all: false, writeConflicts: true }
 */
export function parseInstallArguments(args) {
    const flags = args.filter(isFlag);
    assertKnown(flags, [ALL_FLAG, WRITE_CONFLICTS_FLAG]);
    return {
        names: args.filter((arg) => !isFlag(arg)),
        all: flags.includes(ALL_FLAG),
        writeConflicts: flags.includes(WRITE_CONFLICTS_FLAG),
    };
}
/**
 * Reads `toolbox skills [--diff]`. The command takes no skill names.
 *
 * @example
 *   parseSkillsArguments(['--diff']) // => { diff: true }
 */
export function parseSkillsArguments(args) {
    assertKnown(args, [DIFF_FLAG]);
    return { diff: args.includes(DIFF_FLAG) };
}
