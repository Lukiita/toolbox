import type { FileDiff } from '../application/inspect-skills.mts';
/**
 * A unified diff of two files; empty when they are equal.
 *
 * @example
 *   gitFileDiff('.agents/toolbox/base/retro/SKILL.md', '.agents/skills/retro/SKILL.md')
 */
export declare const gitFileDiff: FileDiff;
