export interface SkillRecord {
    /** The toolbox release the project copied the skill from: where a merge fetches the original. */
    version: string;
    /** `SkillTree.hash` of that original. */
    hash: string;
}
export declare class SkillManifestError extends Error {
}
export declare class SkillManifest {
    private readonly records;
    private constructor();
    static empty(): SkillManifest;
    /**
     * Reads a manifest file's content; throws `SkillManifestError` naming the
     * field and the value when the shape is wrong.
     *
     * @example
     *   SkillManifest.parse(readFileSync('.agents/toolbox-skills.json', 'utf8'))
     */
    static parse(json: string): SkillManifest;
    find(name: string): SkillRecord | undefined;
    names(): string[];
    /**
     * States that the project now holds `record.hash` as the skill's original.
     *
     * @example
     *   manifest.record('code-review', { version: '2.0.0', hash: shipped.hash })
     */
    record(name: string, record: Partial<SkillRecord>): void;
    /**
     * The record leaves the manifest: the project deleted the skill's folder, so
     * there is nothing left for it to describe.
     *
     * @example
     *   manifest.forget('setup-pre-commit')
     */
    forget(name: string): void;
    /** Sorted and indented, so an update shows as a readable diff in the project. */
    serialize(): string;
}
