export interface SkillFile {
    content: Buffer;
    /** Scripts keep their exec bit across the copy; it is not part of the hash. */
    executable: boolean;
}
/**
 * Content with a NUL byte: not text, so neither normalised nor merged.
 *
 * @example
 *   isBinary(Buffer.from('a\0b')) // => true
 */
export declare function isBinary(content: Buffer): boolean;
/**
 * Text as git stores it. One definition for the hash and for the merge: when
 * the hash alone ignored CRLF, a Windows checkout read as intact and then
 * conflicted on every line of every merge (found in review).
 *
 * @example
 *   withUnixLineEndings('a\r\nb\r\n') // => 'a\nb\n'
 */
export declare function withUnixLineEndings(text: string): string;
/**
 * Whether two files hold the same content, line endings aside; an absent file
 * equals only another absent one.
 *
 * @example
 *   sameContent(base.file('SKILL.md'), local.file('SKILL.md')) // => false once edited
 */
export declare function sameContent(one: SkillFile | undefined, other: SkillFile | undefined): boolean;
export declare class SkillTree {
    /** `sha256:<hex>` - the format every written manifest depends on. */
    readonly hash: string;
    private readonly files;
    private constructor();
    /**
     * Builds a tree from `[path, file]` pairs; refuses a path that leaves the folder.
     *
     * @example
     *   SkillTree.of([['SKILL.md', { content: Buffer.from('# x'), executable: false }]])
     */
    static of(entries: Iterable<readonly [string, SkillFile]>): SkillTree;
    paths(): string[];
    entries(): [string, SkillFile][];
    file(path: string): SkillFile | undefined;
    equals(other: SkillTree): boolean;
    /**
     * The paths whose content differs between the two trees, sorted: edited, or
     * present on one side only.
     *
     * @example
     *   base.differingPaths(local) // => ['SKILL.md', 'references/java.md']
     */
    differingPaths(other: SkillTree): string[];
}
