import type { PastReleases } from '../application/ports.mts';
import type { OriginalLookup } from '../domain/reconcile-skill.mts';
/**
 * The URL git clones, from package.json's `repository` field.
 *
 * @example
 *   repositoryCloneUrl('github:Lukiita/toolbox') // => 'https://github.com/Lukiita/toolbox.git'
 */
export declare function repositoryCloneUrl(repository: unknown): string;
export declare class GitPastReleases implements PastReleases {
    private readonly cloneUrl;
    private readonly downloadsRoot;
    private readonly fetched;
    private readonly downloads;
    /**
     * `downloadsRoot` is where the clones go, each in a folder of its own; the
     * system's temp folder unless a test wants to look at it.
     *
     * @example
     *   new GitPastReleases(repositoryCloneUrl(packageJson.repository))
     */
    constructor(cloneUrl: string, downloadsRoot?: string);
    private fetch;
    /**
     * A skill as that release shipped it.
     *
     * @example
     *   releases.skill('2.0.0', 'ddd-tactical') // => { found: true, tree }
     */
    skill(version: string, name: string): OriginalLookup;
    /** Removes what was downloaded. */
    dispose(): void;
    private clone;
}
