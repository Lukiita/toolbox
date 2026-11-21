import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { pathKind } from './path-kind.mts';
import { scratchDirs } from './scratch-dirs.fixtures.ts';

const scratch = scratchDirs('toolbox-path-kind-');

describe('pathKind', () => {
  it('tells a folder, a file and nothing apart', () => {
    const root = scratch();
    mkdirSync(join(root, 'folder'));
    writeFileSync(join(root, 'file'), 'x');
    expect(pathKind(join(root, 'folder'))).toBe('folder');
    expect(pathKind(join(root, 'file'))).toBe('file');
    expect(pathKind(join(root, 'nothing'))).toBe('absent');
  });

  it('calls a link a link, whatever it points at: a folder, a file or nothing', () => {
    const root = scratch();
    mkdirSync(join(root, 'folder'));
    writeFileSync(join(root, 'file'), 'x');
    symlinkSync(join(root, 'folder'), join(root, 'to-folder'), 'dir');
    symlinkSync(join(root, 'file'), join(root, 'to-file'));
    symlinkSync(join(root, 'gone'), join(root, 'dangling'));
    expect(pathKind(join(root, 'to-folder'))).toBe('link');
    expect(pathKind(join(root, 'to-file'))).toBe('link');
    expect(pathKind(join(root, 'dangling'))).toBe('link');
  });

  it('follows the folders on the way to the path, only not the path itself', () => {
    const root = scratch();
    mkdirSync(join(root, 'real', 'skill'), { recursive: true });
    symlinkSync(join(root, 'real'), join(root, 'via'), 'dir');
    expect(pathKind(join(root, 'via', 'skill'))).toBe('folder');
  });

  it('calls anything else "other"', () => {
    expect(pathKind('/dev/null')).toBe('other');
  });
});
