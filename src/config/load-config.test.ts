import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findConfigFile, loadToolboxConfig } from './load-config.mts';

const roots: string[] = [];
function scratchRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'toolbox-config-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('loadToolboxConfig', () => {
  it('a root with no config file runs on the defaults', async () => {
    const root = scratchRoot();
    expect(findConfigFile(root)).toBeUndefined();
    const config = await loadToolboxConfig(root);
    expect(config.quality.lineLimit).toBe(400);
  });

  it('loads toolbox.config.mjs and fills the missing fields', async () => {
    const root = scratchRoot();
    writeFileSync(
      join(root, 'toolbox.config.mjs'),
      "export default { quality: { baseBranch: 'develop' }, hooks: { protectedBranches: ['main', 'develop', 'release'] } };\n",
    );
    const config = await loadToolboxConfig(root);
    expect(config.quality.baseBranch).toBe('develop');
    expect(config.quality.ccLimit).toBe(5);
    expect(config.hooks.protectedBranches).toEqual(['main', 'develop', 'release']);
  });

  it('prefers toolbox.config.ts over .mjs when both exist', () => {
    const root = scratchRoot();
    writeFileSync(join(root, 'toolbox.config.mjs'), 'export default {};\n');
    writeFileSync(join(root, 'toolbox.config.ts'), 'export default {};\n');
    expect(findConfigFile(root)).toBe(join(root, 'toolbox.config.ts'));
  });

  it('names the file and the received type when the default export is not an object', async () => {
    const root = scratchRoot();
    writeFileSync(join(root, 'toolbox.config.mjs'), 'export default 42;\n');
    await expect(loadToolboxConfig(root)).rejects.toThrow(/toolbox\.config\.mjs.*received number/);
  });
});
