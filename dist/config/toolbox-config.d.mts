/** What the quality ratchet measures and where. All optional; see DEFAULT_QUALITY. */
export interface QualityConfig {
    /**
     * Production code, as a regex over repo-relative paths. Drives the size,
     * `any`, complexity, cycle and place-rule collectors and the coverage slice.
     * Default `^src/`; a monorepo widens it (`^apps/[^/]+/src/`).
     */
    sourceWindow: RegExp;
    /**
     * The slot a feature folder occupies, as a regex SOURCE with group 1 = the
     * feature name (undefined in the flat layout). Default `^src/(?:([^/]+)/)?`.
     * A monorepo re-anchors it once, for every layer pattern.
     */
    featureSlot: string;
    /** Above this, a production file enters the size count. Default 400. */
    lineLimit: number;
    /** Above this, a function enters the complexity count. Default 5. */
    ccLimit: number;
    /** Non-relative import prefixes resolved as internal. Default `{ '@/': '' }`. */
    aliasPrefixes: Record<string, string>;
    /** Where the coverage run writes its json, relative to the root. */
    coveragePath: string;
    /** The vitest config the ratchet runs with; `undefined` = the project default. */
    vitestConfig: string | undefined;
    /** Paths jscpd scans, relative to the root. Default `['src']`. */
    duplicationPaths: string[];
    /** The branch pull requests merge into; the pre-push hook measures against its tip. */
    baseBranch: string;
    /**
     * Whether the pre-push hook reuses the coverage json on disk instead of
     * running the suite. Default false - CI runs the suite, and a stale json
     * goes green where CI goes red. Opt in when coverage is not gated or the
     * suite is too slow for a push.
     */
    prePushSkipTests: boolean;
}
/** What the agent hooks watch. All optional; see DEFAULT_HOOKS. */
export interface HooksConfig {
    /** Files that must have a co-located test, as regexes over repo-relative paths. */
    watchedPatterns: RegExp[];
    /** Artefacts with no behaviour of their own that could regress. */
    exemptSuffixes: string[];
    /** Branches a direct `git push` is denied to. */
    protectedBranches: string[];
}
/** The shape of `toolbox.config.ts` in a project: every field optional. */
export interface ToolboxConfig {
    quality?: Partial<QualityConfig>;
    hooks?: Partial<HooksConfig>;
}
/** The config with every field filled - what the library actually reads. */
export interface ResolvedToolboxConfig {
    quality: QualityConfig;
    hooks: HooksConfig;
}
export declare const DEFAULT_QUALITY: QualityConfig;
export declare const DEFAULT_HOOKS: HooksConfig;
/**
 * Fills a project's partial config with the defaults, field by field. Pure.
 *
 * @example
 *   resolveToolboxConfig({ quality: { lineLimit: 300 } }).quality.ccLimit // => 5
 */
export declare function resolveToolboxConfig(partial?: ToolboxConfig): ResolvedToolboxConfig;
/**
 * Identity with a type: lets `toolbox.config.ts` get autocomplete without
 * importing a type.
 *
 * @example
 *   export default defineToolboxConfig({ quality: { baseBranch: 'develop' } });
 */
export declare function defineToolboxConfig(config: ToolboxConfig): ToolboxConfig;
