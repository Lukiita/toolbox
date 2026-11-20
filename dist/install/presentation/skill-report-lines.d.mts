import type { SkillInspection } from '../application/inspect-skills.mts';
import type { SkillInstallReport } from '../application/install-skills.mts';
/**
 * One line of `toolbox install`.
 *
 * @example
 *   installLine({ name: 'retro', status: 'copied', files: [] })
 *   // => 'copied:          .agents/skills/retro'
 */
export declare function installLine({ name, status, files, reason }: SkillInstallReport): string;
/**
 * The lines of `toolbox skills` for one skill: its state, then the files that differ.
 *
 * @example
 *   inspectionLines(inspection)
 *   // => ['altered           ddd-tactical (1.2.0)', '    edited by the project: SKILL.md']
 */
export declare function inspectionLines(inspection: SkillInspection): string[];
