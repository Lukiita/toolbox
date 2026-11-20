import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

describe('GitPastReleases', () => {
  it('fetches the package as a release tagged it', () => {
    const releases = new GitPastReleases(`file://${repository(['1.2.0', '1.3.0'])}`);
    const fetched = releases.fetch('1.2.0');
    expect(fetched.fetched).toBe(true);
    const dir = fetched.fetched ? fetched.packageDir : '';
    expect(readFileSync(join(dir, 'skills', 'retro', 'SKILL.md'), 'utf8')).toBe('retro 1.2.0\n');
    releases.dispose();
  });

  it('says why when the release has no tag', () => {
    const releases = new GitPastReleases(`file://${repository(['1.2.0'])}`);
    const fetched = releases.fetch('9.9.9');
    expect(fetched.fetched).toBe(false);
    expect(fetched.fetched ? '' : fetched.reason).toMatch(
      /^could not fetch v9\.9\.9 from file:\/\/.*: fatal: .*v9\.9\.9/,
    );
    releases.dispose();
  });

  it('says why when the repository cannot be reached', () => {
    const releases = new GitPastReleases(`file://${join(scratch(), 'no-such-repository')}`);
    const fetched = releases.fetch('1.2.0');
    // git's own "fatal: …" line, not the advice it prints after it.
    expect(fetched.fetched ? '' : fetched.reason).toMatch(
      /^could not fetch v1\.2\.0 from file:\/\/.*no-such-repository: fatal: /,
    );
    releases.dispose();
  });

  it('fetches a release once: the second request is answered from the first', () => {
    const repo = repository(['1.2.0']);
    const releases = new GitPastReleases(`file://${repo}`);
    const first = releases.fetch('1.2.0');
    rmSync(repo, { recursive: true });
    expect(releases.fetch('1.2.0')).toEqual(first);
    releases.dispose();
  });

  // Ten edited skills on a machine with no network must cost one failed
  // fetch, not ten timeouts in a row.
  it('does not try a failed release again in the same run', () => {
    const repo = repository(['1.2.0']);
    const releases = new GitPastReleases(`file://${repo}`);
    const first = releases.fetch('1.3.0');
    release(repo, '1.3.0');
    expect(releases.fetch('1.3.0')).toEqual(first);
    expect(first.fetched).toBe(false);
    releases.dispose();
  });

  it('removes what it downloaded when disposed of', () => {
    const releases = new GitPastReleases(`file://${repository(['1.2.0'])}`);
    const fetched = releases.fetch('1.2.0');
    const dir = fetched.fetched ? fetched.packageDir : '';
    expect(existsSync(dir)).toBe(true);
    releases.dispose();
    expect(existsSync(dir)).toBe(false);
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
