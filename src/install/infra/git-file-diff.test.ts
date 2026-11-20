import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dirs.fixtures.ts';
import { gitFileDiff } from './git-file-diff.mts';

const scratchDir = scratchDirs('toolbox-diff-');
function scratch(files: Record<string, string>): string {
  const root = scratchDir();
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

describe('gitFileDiff', () => {
  it('shows the lines that changed between two files, as a unified diff', () => {
    const root = scratch({ from: 'one\ntwo\n', to: 'one\n2\n' });
    const diff = gitFileDiff(join(root, 'from'), join(root, 'to'));
    expect(diff).toContain(`--- a${join(root, 'from')}`);
    expect(diff).toContain(`+++ b${join(root, 'to')}`);
    expect(diff).toContain('@@ -1,2 +1,2 @@\n one\n-two\n+2\n');
  });

  it('shows a file that exists on one side only as wholly added or removed', () => {
    const root = scratch({ only: 'one\n' });
    expect(gitFileDiff(join(root, 'absent'), join(root, 'only'))).toContain(
      '--- /dev/null\n+++ b' + join(root, 'only') + '\n@@ -0,0 +1 @@\n+one\n',
    );
    expect(gitFileDiff(join(root, 'only'), join(root, 'absent'))).toContain(
      '+++ /dev/null\n@@ -1 +0,0 @@\n-one\n',
    );
  });

  it('is empty for two equal files', () => {
    const root = scratch({ from: 'same\n', to: 'same\n' });
    expect(gitFileDiff(join(root, 'from'), join(root, 'to'))).toBe('');
  });
});
