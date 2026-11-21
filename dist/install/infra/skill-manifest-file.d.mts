import { SkillManifest } from '../domain/skill-manifest.mts';
/**
 * The project's manifest; empty when the project has none yet.
 *
 * @example
 *   readSkillManifest('/p').find('code-review') // => { version: '2.0.0', hash: 'sha256:…' }
 */
export declare function readSkillManifest(projectRoot: string): SkillManifest;
/**
 * Saves the manifest; a no-op when the file already says the same, so an
 * install that changed nothing leaves nothing to commit.
 *
 * @example
 *   writeSkillManifest('/p', manifest)
 */
export declare function writeSkillManifest(projectRoot: string, manifest: SkillManifest): void;
