// The diff `toolbox skills --diff` prints, done by git: `git diff --no-index`
// compares two files outside any repository. The files are written here, in
// a temporary folder, from content the caller already read - git never opens
// a path in the project. Handed the project's paths, it followed a link
// inside a skill and printed files from outside the project (found in
// review); a named pipe there could also have hung it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GIT_OUTPUT_LIMIT } from "./git-output-limit.mjs";
const DIFF_TIMEOUT_MS = 30_000;
// Under its label, inside the temp folder; an absent side is git's own "no file".
function placed(root, { label, content }) {
    if (content === undefined)
        return '/dev/null';
    const path = join(root, label);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return label;
}
/**
 * Exit 0 means "equal" and 1 "they differ": both are the answer. Anything
 * else is a failure, said in the output instead of an empty diff that reads
 * as "nothing changed".
 *
 * @example
 *   diffOrFailure({ status: 128, stdout: '', stderr: 'fatal: …' }, from) // => 'could not diff …: fatal: …\n'
 */
export function diffOrFailure(run, from) {
    if (run.status === 0 || run.status === 1)
        return String(run.stdout);
    const reason = String(run.stderr ?? '').trim() || String(run.error);
    return `could not diff ${from.label}: ${reason}\n`;
}
/**
 * A unified diff of two contents, headed by their labels; empty when equal.
 *
 * @example
 *   gitFileDiff({ label: 'toolbox/retro/SKILL.md', content }, { label: '.agents/skills/retro/SKILL.md', content: mine })
 */
export const gitFileDiff = (from, to) => {
    const root = mkdtempSync(join(tmpdir(), 'toolbox-diff-'));
    try {
        const run = spawnSync('git', ['diff', '--no-index', '--no-color', '--', placed(root, from), placed(root, to)], { cwd: root, encoding: 'utf8', maxBuffer: GIT_OUTPUT_LIMIT, timeout: DIFF_TIMEOUT_MS });
        return diffOrFailure(run, from);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
};
