// The manifest's file. Versioned in the project on purpose: it is what tells
// the next install - on any machine - which skills the project edited.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SkillManifest, SkillManifestError } from '../domain/skill-manifest.mts';
import { MANIFEST_FILE } from '../application/skill-layout.mts';
import { type PathKind, pathKind } from './path-kind.mts';

// Sixteen skills are about three kilobytes. Anything near this is not a
// manifest, and reading it whole would only be a way to hang the command.
const LARGEST_MANIFEST = 1024 * 1024;

const FOUND: Record<Exclude<PathKind, 'absent' | 'file'>, string> = {
  link: 'a symbolic link',
  folder: 'a folder',
  other: 'something that is not a file',
};

// Where the manifest goes there is a regular file, or nothing. A link there
// was followed both ways: an install created, or overwrote, the file it
// pointed at, outside the project (found in review).
function manifestOnDisk(path: string): 'absent' | 'file' {
  const kind = pathKind(path);
  if (kind === 'absent' || kind === 'file') return kind;
  throw new SkillManifestError(
    `${MANIFEST_FILE}: expected a regular file, found ${FOUND[kind]}; the manifest is never read or written through one`,
  );
}

function readManifestText(path: string): string {
  const { size } = statSync(path);
  if (size <= LARGEST_MANIFEST) return readFileSync(path, 'utf8');
  throw new SkillManifestError(
    `${MANIFEST_FILE}: received a file of ${size} bytes, expected a manifest of at most ${LARGEST_MANIFEST}`,
  );
}

/**
 * The project's manifest; empty when the project has none yet.
 *
 * @example
 *   readSkillManifest('/p').find('code-review') // => { version: '2.0.0', hash: 'sha256:…' }
 */
export function readSkillManifest(projectRoot: string): SkillManifest {
  const path = join(projectRoot, MANIFEST_FILE);
  if (manifestOnDisk(path) === 'absent') return SkillManifest.empty();
  try {
    return SkillManifest.parse(readManifestText(path));
  } catch (e) {
    if (!(e instanceof SkillManifestError) || e.message.startsWith(MANIFEST_FILE)) throw e;
    throw new SkillManifestError(`${MANIFEST_FILE}: ${e.message}`);
  }
}

/**
 * Saves the manifest; a no-op when the file already says the same, so an
 * install that changed nothing leaves nothing to commit.
 *
 * @example
 *   writeSkillManifest('/p', manifest)
 */
export function writeSkillManifest(projectRoot: string, manifest: SkillManifest): void {
  const path = join(projectRoot, MANIFEST_FILE);
  const content = manifest.serialize();
  const current = manifestOnDisk(path) === 'file' ? readManifestText(path) : undefined;
  if (current === content) return;
  if (current === undefined && manifest.names().length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
