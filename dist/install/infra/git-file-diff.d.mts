import type { FileDiff } from '../application/ports.mts';
/**
 * A unified diff of two files; empty when they are equal.
 *
 * @example
 *   gitFileDiff('node_modules/@lukiita/toolbox/skills/retro/SKILL.md', '.agents/skills/retro/SKILL.md')
 */
export declare const gitFileDiff: FileDiff;
