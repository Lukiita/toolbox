import { type ResolvedToolboxConfig } from './toolbox-config.mts';
export declare const CONFIG_FILE_NAMES: readonly ["toolbox.config.ts", "toolbox.config.mts", "toolbox.config.mjs", "toolbox.config.js"];
/**
 * The config file the root has, or undefined when it runs on defaults.
 *
 * @example
 *   findConfigFile('/p') // => '/p/toolbox.config.ts' or undefined
 */
export declare function findConfigFile(root: string): string | undefined;
/**
 * Loads and resolves the project's config. The default export must be an
 * object; a wrong shape names the file and what was received, so the fix is
 * one edit away instead of a debugging round.
 *
 * @example
 *   const { quality } = await loadToolboxConfig(process.cwd());
 */
export declare function loadToolboxConfig(root: string): Promise<ResolvedToolboxConfig>;
