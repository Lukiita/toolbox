import type { PastReleases } from '../application/ports.mts';
import type { OriginalLookup } from '../domain/reconcile-skill.mts';
/** A release, fetched: its package folder, or why it could not be had. */
export type FetchedRelease = {
    fetched: true;
    packageDir: string;
} | {
    fetched: false;
    reason: string;
};
/**
 * The URL git clones, from package.json's `repository` field.
 *
 * @example
 *   repositoryCloneUrl('github:Lukiita/toolbox') // => 'https://github.com/Lukiita/toolbox.git'
 */
export declare function repositoryCloneUrl(repository: unknown): string;
export declare class GitPastReleases implements PastReleases {
    private readonly cloneUrl;
    private readonly fetched;
    private readonly downloads;
    /**
     * @example
     *   new GitPastReleases(repositoryCloneUrl(packageJson.repository))
     */
    constructor(cloneUrl: string);
    /** The package folder of that release, or why it could not be fetched. Asked once per run. */
    fetch(version: string): FetchedRelease;
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
