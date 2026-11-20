// The diff `toolbox skills --diff` prints, done by git: `git diff --no-index`
// compares two files outside any repository.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
// A file present on one side only (added or deleted by the project, or by the
// new version) is diffed against nothing - git's own spelling of "no file".
function orNothing(path) {
    return existsSync(path) ? path : '/dev/null';
}
/**
 * A unified diff of two files; empty when they are equal.
 *
 * @example
 *   gitFileDiff('.agents/toolbox/base/retro/SKILL.md', '.agents/skills/retro/SKILL.md')
 */
export const gitFileDiff = (from, to) => {
    // Exit 1 means "they differ", which is the answer, not a failure.
    const run = spawnSync('git', ['diff', '--no-index', '--no-color', '--', orNothing(from), orNothing(to)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return run.stdout;
};
