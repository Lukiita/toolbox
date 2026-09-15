import { type ResolvedToolboxConfig, type ToolboxConfig } from './toolbox-config.mts';
export declare const CONFIG_FILE_NAMES: readonly ["toolbox.config.ts", "toolbox.config.mts", "toolbox.config.mjs", "toolbox.config.js"];
/**
 * The config file the root has, or undefined when it runs on defaults.
 *
 * @example
 *   findConfigFile('/p') // => '/p/toolbox.config.ts' or undefined
 */
export declare function findConfigFile(root: string): string | undefined;
/**
 * The raw default export of the config file, unvalidated - for a caller that
 * resolves one section on its own (the hooks: a typo in `quality` must not
 * silently drop `hooks.protectedBranches` to the defaults, loop round 2).
 *
 * @example
 *   const { hooks } = await loadToolboxConfigPartial(root);
 */
export declare function loadToolboxConfigPartial(root: string): Promise<ToolboxConfig>;
/**
 * Loads and resolves the project's config. A wrong shape names the file (or
 * the field and value) so the fix is one edit away instead of a debugging round.
 *
 * @example
 *   const { quality } = await loadToolboxConfig(process.cwd());
 */
export declare function loadToolboxConfig(root: string): Promise<ResolvedToolboxConfig>;
