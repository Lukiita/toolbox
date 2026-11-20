// Temp folders for the tests that touch the disk, removed after each test.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach } from 'vitest';

/**
 * Call once at the top of a test file; the function it returns makes a fresh
 * temp folder, and every folder made in a test is removed when it ends.
 *
 * @example
 *   const scratch = scratchDirs('toolbox-install-');
 *   it('…', () => { const root = scratch(); });
 */
export function scratchDirs(prefix: string): () => string {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  return () => {
    const root = mkdtempSync(join(tmpdir(), prefix));
    roots.push(root);
    return root;
  };
}
