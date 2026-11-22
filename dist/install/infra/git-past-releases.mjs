// The original of a skill, read from the release that shipped it (ADR-0003).
//
// A three-way merge needs the content the project copied before editing it.
// Keeping that copy in the project would put every skill in the repository
// twice, so the manifest records only which release it was (version + hash)
// and the release is fetched here, from its tag, when a merge needs it.
//
// This is the one place where `toolbox install` leaves the machine, and each
// way it can fail is settled here:
// - no network, tag gone, repository moved: a result with the reason, never
//   a throw. The caller keeps the project's skill as it is and reports it;
//   the fix is to run install again when the release can be reached.
// - a slow or hanging remote: the clone is cut at CLONE_TIMEOUT_MS.
// - credentials asked for (a private fork): git is told not to prompt, so an
//   install run from a script fails at once instead of waiting on a terminal.
// - several skills on the same release: one clone, kept for the run.
// - a failure: kept for the run too. No retry, on purpose: the command is
//   re-run by a person, and the edited skills copied from one release (the
//   usual case: they move together) must cost one failed fetch, not one
//   timeout each.
// A fetched release is not trusted either: the domain checks its hash against
// the record before merging (`reconcile-skill.mts`).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PACKAGE_SKILLS_DIR } from "../application/skill-layout.mjs";
import { readShippedSkillTree } from "./skill-directory.mjs";
// The README's release recipe: `git tag vX.Y.Z`.
const TAG_PREFIX = 'v';
const CLONE_TIMEOUT_MS = 60_000;
const GITHUB_SHORTHAND = /^github:(.+)$/;
function asUrl(repository) {
    const shorthand = GITHUB_SHORTHAND.exec(repository);
    if (shorthand)
        return `https://github.com/${shorthand[1]}.git`;
    return repository.replace(/^git\+/, '');
}
function repositoryString(repository) {
    const isObject = typeof repository === 'object' && repository !== null;
    return isObject ? repository.url : repository;
}
/**
 * The URL git clones, from package.json's `repository` field.
 *
 * @example
 *   repositoryCloneUrl('github:Lukiita/toolbox') // => 'https://github.com/Lukiita/toolbox.git'
 */
export function repositoryCloneUrl(repository) {
    const value = repositoryString(repository);
    if (typeof value === 'string' && value !== '')
        return asUrl(value);
    throw new Error(`package.json "repository": received ${JSON.stringify(repository)}, expected "github:<owner>/<repo>" or a git URL`);
}
// git's first "fatal:" line says what went wrong; the lines after it are
// advice ("Please make sure you have the correct access rights…"). With no
// output at all the spawn itself failed: git missing, or the timeout.
function failureReason(stderr, error) {
    const lines = stderr.trim().split('\n');
    return lines.find((line) => line.startsWith('fatal:')) || lines[0] || String(error);
}
export class GitPastReleases {
    cloneUrl;
    downloadsRoot;
    fetched = new Map();
    downloads = [];
    /**
     * `downloadsRoot` is where the clones go, each in a folder of its own; the
     * system's temp folder unless a test wants to look at it.
     *
     * @example
     *   new GitPastReleases(repositoryCloneUrl(packageJson.repository))
     */
    constructor(cloneUrl, downloadsRoot = tmpdir()) {
        this.cloneUrl = cloneUrl;
        this.downloadsRoot = downloadsRoot;
    }
    // The package folder of that release, or why it could not be fetched. Asked once per run.
    fetch(version) {
        const known = this.fetched.get(version);
        if (known)
            return known;
        const release = this.clone(`${TAG_PREFIX}${version}`);
        this.fetched.set(version, release);
        return release;
    }
    /**
     * A skill as that release shipped it.
     *
     * @example
     *   releases.skill('2.0.0', 'ddd-tactical') // => { found: true, tree }
     */
    skill(version, name) {
        const release = this.fetch(version);
        if (!release.fetched)
            return { found: false, reason: release.reason };
        const tree = readShippedSkillTree(join(release.packageDir, PACKAGE_SKILLS_DIR, name), version);
        if (tree)
            return { found: true, tree };
        return { found: false, reason: `the ${version} release has no skill named ${name}` };
    }
    /** Removes what was downloaded. */
    dispose() {
        for (const dir of this.downloads.splice(0))
            rmSync(dir, { recursive: true, force: true });
        this.fetched.clear();
    }
    // The tag alone, without history: the skills of one release are all a merge needs.
    clone(tag) {
        const dir = mkdtempSync(join(this.downloadsRoot, 'toolbox-release-'));
        this.downloads.push(dir);
        const run = spawnSync('git', ['clone', '--quiet', '--depth', '1', '--branch', tag, this.cloneUrl, dir], {
            encoding: 'utf8',
            timeout: CLONE_TIMEOUT_MS,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        if (run.status === 0)
            return { fetched: true, packageDir: dir };
        const reason = failureReason(run.stderr ?? '', run.error);
        return {
            fetched: false,
            reason: `could not fetch ${tag} from ${this.cloneUrl}: ${reason}`,
        };
    }
}
