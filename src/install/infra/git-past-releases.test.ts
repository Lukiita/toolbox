import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseReleaseNumber as v } from '../domain/toolbox-version.mts';

import { GitPastReleases, repositoryCloneUrl } from './git-past-releases.mts';
import { scratchDirs } from './scratch-dirs.fixtures.ts';

const scratch = scratchDirs('toolbox-releases-');

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    stdio: 'ignore',
  });
}

/** A repository standing in for the toolbox's, with one commit and one tag per version given. */
function repository(versions: string[]): string {
  const repo = join(scratch(), 'toolbox');
  mkdirSync(join(repo, 'skills', 'retro'), { recursive: true });
  git(repo, 'init', '--quiet');
  for (const version of versions) release(repo, version);
  return repo;
}

function release(repo: string, version: string): void {
  writeFileSync(join(repo, 'skills', 'retro', 'SKILL.md'), `retro ${version}\n`);
  git(repo, 'add', '-A');
  git(repo, 'commit', '--quiet', '-m', `release ${version}`);
  git(repo, 'tag', `v${version}`);
}

const retroOf = (releases: GitPastReleases, version: string): string | undefined => {
  const lookup = releases.skill(v(version), 'retro');
  return lookup.found ? lookup.tree.file('SKILL.md')?.content.toString() : undefined;
};
const reasonOf = (releases: GitPastReleases, version: string): string => {
  const lookup = releases.skill(v(version), 'retro');
  return lookup.found ? '' : lookup.reason;
};

describe('GitPastReleases', () => {
  it('reads a skill as the release tagged it, not as the repository is now', () => {
    const releases = new GitPastReleases(`file://${repository(['1.2.0', '1.3.0'])}`);
    expect(retroOf(releases, '1.2.0')).toBe('retro 1.2.0\n');
    releases.dispose();
  });

  it('says so when the release has no skill by that name', () => {
    const releases = new GitPastReleases(`file://${repository(['1.2.0'])}`);
    expect(releases.skill(v('1.2.0'), 'no-such-skill')).toEqual({
      found: false,
      reason: 'the 1.2.0 release has no skill named no-such-skill',
    });
    releases.dispose();
  });

  it('says why when the release has no tag', () => {
    const releases = new GitPastReleases(`file://${repository(['1.2.0'])}`);
    expect(reasonOf(releases, '9.9.9')).toMatch(
      /^could not fetch v9\.9\.9 from file:\/\/.*: fatal: .*v9\.9\.9/,
    );
    releases.dispose();
  });

  it('says why when the repository cannot be reached', () => {
    const releases = new GitPastReleases(`file://${join(scratch(), 'no-such-repository')}`);
    // git's own "fatal: …" line, not the advice it prints after it.
    expect(reasonOf(releases, '1.2.0')).toMatch(
      /^could not fetch v1\.2\.0 from file:\/\/.*no-such-repository: fatal: /,
    );
    releases.dispose();
  });

  it('fetches a release once: the second request is answered from the first', () => {
    const repo = repository(['1.2.0']);
    const releases = new GitPastReleases(`file://${repo}`);
    expect(retroOf(releases, '1.2.0')).toBe('retro 1.2.0\n');
    rmSync(repo, { recursive: true });
    expect(retroOf(releases, '1.2.0')).toBe('retro 1.2.0\n');
    releases.dispose();
  });

  // The edited skills copied from one release must cost one failed fetch,
  // not one timeout each.
  it('does not try a failed release again in the same run', () => {
    const repo = repository(['1.2.0']);
    const releases = new GitPastReleases(`file://${repo}`);
    const first = reasonOf(releases, '1.3.0');
    release(repo, '1.3.0');
    expect(reasonOf(releases, '1.3.0')).toBe(first);
    expect(first).toMatch(/^could not fetch v1\.3\.0/);
    releases.dispose();
  });

  it('downloads into the folder it was given, and removes it all when disposed of', () => {
    const downloads = scratch();
    const releases = new GitPastReleases(`file://${repository(['1.2.0'])}`, downloads);
    releases.skill(v('1.2.0'), 'retro');
    releases.skill(v('9.9.9'), 'retro');
    expect(readdirSync(downloads).length).toBeGreaterThan(0);
    releases.dispose();
    expect(readdirSync(downloads)).toEqual([]);
  });
});

describe('repositoryCloneUrl', () => {
  it.each([
    ['github:Lukiita/toolbox', 'https://github.com/Lukiita/toolbox.git'],
    ['git+https://example.com/x/toolbox.git', 'https://example.com/x/toolbox.git'],
    ['https://example.com/x/toolbox.git', 'https://example.com/x/toolbox.git'],
    ['git@github.com:Lukiita/toolbox.git', 'git@github.com:Lukiita/toolbox.git'],
  ])('reads %j as %s', (repository, url) => {
    expect(repositoryCloneUrl(repository)).toBe(url);
  });

  it('reads the object form of package.json', () => {
    expect(repositoryCloneUrl({ type: 'git', url: 'git+https://example.com/t.git' })).toBe(
      'https://example.com/t.git',
    );
  });

  it.each([undefined, 42, {}, { url: 7 }, ''])('refuses %j, which names no repository', (value) => {
    expect(() => repositoryCloneUrl(value)).toThrow(
      `package.json "repository": received ${JSON.stringify(value)}, expected "github:<owner>/<repo>" or a git URL`,
    );
  });
});
