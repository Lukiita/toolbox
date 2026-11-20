// The manifest's file. Versioned in the project on purpose: it is what tells
// the next install - on any machine - which skills the project edited.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SkillManifest, SkillManifestError } from "../domain/skill-manifest.aggregate.mjs";
import { MANIFEST_FILE } from "./skill-layout.mjs";
/**
 * The project's manifest; empty when the project has none yet.
 *
 * @example
 *   readSkillManifest('/p').find('code-review') // => { version: '2.0.0', hash: 'sha256:…' }
 */
export function readSkillManifest(projectRoot) {
    const path = join(projectRoot, MANIFEST_FILE);
    if (!existsSync(path))
        return SkillManifest.empty();
    try {
        return SkillManifest.parse(readFileSync(path, 'utf8'));
    }
    catch (e) {
        if (!(e instanceof SkillManifestError))
            throw e;
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
export function writeSkillManifest(projectRoot, manifest) {
    const path = join(projectRoot, MANIFEST_FILE);
    const content = manifest.serialize();
    const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    if (current === content)
        return;
    if (current === undefined && manifest.names().length === 0)
        return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
}
