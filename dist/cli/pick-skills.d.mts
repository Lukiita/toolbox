import { type CatalogEntry, type SkillSelection } from '../install/index.mts';
/**
 * Shows the picker and resolves with what the person picked, or with
 * undefined when they closed it without confirming. Only call with a terminal
 * on both stdin and stdout.
 *
 * @example
 *   const picked = await pickSkills(skillCatalog(folders), '2.0.0');
 */
export declare function pickSkills(catalog: readonly CatalogEntry[], version: string): Promise<SkillSelection | undefined>;
