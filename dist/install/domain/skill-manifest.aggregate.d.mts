export interface SkillRecord {
    /** The toolbox release whose copy of the skill the project holds as base. */
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
    /** Sorted and indented, so an update shows as a readable diff in the project. */
    serialize(): string;
}
