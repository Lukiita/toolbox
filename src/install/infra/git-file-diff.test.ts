import { describe, expect, it } from 'vitest';

import { diffOrFailure, gitFileDiff } from './git-file-diff.mts';

const side = (
  label: string,
  text: string | undefined,
): { label: string; content: Buffer | undefined } => ({
  label,
  content: text === undefined ? undefined : Buffer.from(text),
});

// The diff is of content the caller already read, never of paths in the
// project: handed paths, git opened them, and a link inside a skill pulled
// files from outside the project into the output (found in review).
describe('gitFileDiff', () => {
  it('shows the lines that changed between two contents, labelled as given', () => {
    const diff = gitFileDiff(
      side('toolbox/retro/SKILL.md', 'one\ntwo\n'),
      side('project/retro/SKILL.md', 'one\n2\n'),
    );
    expect(diff).toContain('--- a/toolbox/retro/SKILL.md\n+++ b/project/retro/SKILL.md\n');
    expect(diff).toContain('@@ -1,2 +1,2 @@\n one\n-two\n+2\n');
  });

  it('shows a file present on one side only as wholly added or removed', () => {
    const added = gitFileDiff(
      side('toolbox/retro/new.md', undefined),
      side('project/retro/new.md', 'one\n'),
    );
    expect(added).toContain('--- /dev/null\n+++ b/project/retro/new.md\n@@ -0,0 +1 @@\n+one\n');
    const removed = gitFileDiff(
      side('project/retro/old.md', 'one\n'),
      side('toolbox/retro/old.md', undefined),
    );
    expect(removed).toContain('--- a/project/retro/old.md\n+++ /dev/null\n@@ -1 +0,0 @@\n-one\n');
  });

  it('labels nested files with their path inside the skill', () => {
    const diff = gitFileDiff(
      side('toolbox/retro/references/a.md', 'x\n'),
      side('project/retro/references/a.md', 'y\n'),
    );
    expect(diff).toContain('--- a/toolbox/retro/references/a.md');
  });

  it('is empty for two equal contents', () => {
    expect(gitFileDiff(side('toolbox/r/a.md', 'same\n'), side('project/r/a.md', 'same\n'))).toBe(
      '',
    );
  });
});

describe('diffOrFailure', () => {
  const from = side('toolbox/retro/SKILL.md', 'x');

  it('takes exit 0 and exit 1 as the answer: equal, or a diff', () => {
    expect(diffOrFailure({ status: 0, stdout: '', stderr: '' }, from)).toBe('');
    expect(diffOrFailure({ status: 1, stdout: '@@ diff', stderr: '' }, from)).toBe('@@ diff');
  });

  // Ignored, a failure printed nothing, which reads as "nothing changed".
  it('says so when git failed, with what git said', () => {
    expect(
      diffOrFailure({ status: 128, stdout: '', stderr: 'fatal: unsupported file type\n' }, from),
    ).toBe('could not diff toolbox/retro/SKILL.md: fatal: unsupported file type\n');
  });

  it('says why when git did not run at all', () => {
    const run = {
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('spawnSync git ETIMEDOUT'),
    };
    expect(diffOrFailure(run, from)).toBe(
      'could not diff toolbox/retro/SKILL.md: Error: spawnSync git ETIMEDOUT\n',
    );
  });
});
