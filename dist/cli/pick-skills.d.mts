import { type SkillSelection, startPicker } from '../install/index.mts';
type CatalogEntries = Parameters<typeof startPicker>[0];
/**
 * Shows the picker and resolves with what the person picked, or with
 * undefined when they closed it without confirming. Only call with a terminal
 * on both stdin and stdout.
 *
 * @example
 *   const picked = await pickSkills(skillCatalog(folders), '2.0.0');
 */
export declare function pickSkills(catalog: CatalogEntries, version: string): Promise<SkillSelection | undefined>;
export {};
