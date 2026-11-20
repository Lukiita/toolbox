import type { SkillInspection } from '../application/inspect-skills.mts';
import type { SkillInstallReport } from '../application/install-skills.mts';
/**
 * One line of `toolbox install`.
 *
 * @example
 *   installLine({ name: 'retro', status: 'copied', files: [] })
 *   // => 'copied:          .agents/skills/retro'
 */
export declare function installLine({ name, status, files }: SkillInstallReport): string;
/**
 * The lines of `toolbox skills` for one skill: its state, then the files on
 * each side that differ from the original.
 *
 * @example
 *   inspectionLines(inspection)
 *   // => ['altered, behind   ddd-tactical (1.2.0)', '    edited by the project: SKILL.md', ...]
 */
export declare function inspectionLines(inspection: SkillInspection): string[];
