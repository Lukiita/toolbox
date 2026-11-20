import type { FetchedRelease, PastReleases } from '../application/install-skills.mts';
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
    /** Removes what was downloaded. */
    dispose(): void;
    private clone;
}
