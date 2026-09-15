// Finds and loads `toolbox.config.*` at the project root.
//
// `.ts` first because the project gets autocomplete from it; Node strips the
// types on import (>= 22.18, the package's engine floor). `.mjs`/`.js` are for
// a project that cannot run TypeScript config. No file = defaults, which is a
// valid state, not an error: a fresh import behaves like the canonical copy.
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveToolboxConfig, } from "./toolbox-config.mjs";
export const CONFIG_FILE_NAMES = [
    'toolbox.config.ts',
    'toolbox.config.mts',
    'toolbox.config.mjs',
    'toolbox.config.js',
];
/**
 * The config file the root has, or undefined when it runs on defaults.
 *
 * @example
 *   findConfigFile('/p') // => '/p/toolbox.config.ts' or undefined
 */
export function findConfigFile(root) {
    return CONFIG_FILE_NAMES.map((name) => resolve(root, name)).find((path) => existsSync(path));
}
function isToolboxConfig(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Loads and resolves the project's config. The default export must be an
 * object; a wrong shape names the file and what was received, so the fix is
 * one edit away instead of a debugging round.
 *
 * @example
 *   const { quality } = await loadToolboxConfig(process.cwd());
 */
export async function loadToolboxConfig(root) {
    const file = findConfigFile(root);
    if (!file)
        return resolveToolboxConfig();
    const loaded = (await import(__rewriteRelativeImportExtension(pathToFileURL(file).href)));
    if (!isToolboxConfig(loaded.default)) {
        const received = Array.isArray(loaded.default) ? 'array' : typeof loaded.default;
        throw new Error(`${file}: expected a default export object ({ quality?, hooks? }), received ${received}`);
    }
    return resolveToolboxConfig(loaded.default);
}
