// A skill as the installer compares it: the files of one folder, addressed by
// a path relative to it, and one hash over all of them.
//
// The hash is what "did the project edit this skill?" means (ADR-0003): the
// manifest records the hash of the original, and a folder whose hash still
// equals it is intact. Three things are left out of the hash on purpose,
// because each would make an unedited skill read as edited:
// - the exec bit (a checkout on Windows, or a chmod, is not an edit);
// - CRLF vs LF in text files (git's `core.autocrlf` rewrites them on checkout);
// - the order the files were read in (the paths are sorted by code unit, never
//   by locale: `localeCompare` sorts differently from one machine to the next).
import { createHash } from 'node:crypto';
const NUL_BYTE = 0;
/**
 * Content with a NUL byte: not text, so neither normalised nor merged.
 *
 * @example
 *   isBinary(Buffer.from('a\0b')) // => true
 */
export function isBinary(content) {
    return content.includes(NUL_BYTE);
}
function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}
/**
 * Text as git stores it. One definition for the hash and for the merge: when
 * the hash alone ignored CRLF, a Windows checkout read as intact and then
 * conflicted on every line of every merge (found in review).
 *
 * @example
 *   withUnixLineEndings('a\r\nb\r\n') // => 'a\nb\n'
 */
export function withUnixLineEndings(text) {
    return text.replaceAll('\r\n', '\n');
}
// latin1 maps every byte to one code unit and back, so the CRLF replacement
// touches nothing else - utf8 would rewrite invalid sequences on the way.
function contentDigest(content) {
    if (isBinary(content))
        return sha256(content);
    return sha256(Buffer.from(withUnixLineEndings(content.toString('latin1')), 'latin1'));
}
/**
 * Whether two files hold the same content, line endings aside; an absent file
 * equals only another absent one.
 *
 * @example
 *   sameContent(base.file('SKILL.md'), local.file('SKILL.md')) // => false once edited
 */
export function sameContent(one, other) {
    if (one === undefined || other === undefined)
        return one === other;
    return contentDigest(one.content) === contentDigest(other.content);
}
function isPlainSegment(segment) {
    return segment !== '' && segment !== '.' && segment !== '..' && !segment.includes('\\');
}
// A tree is written under a skill's folder and the folder is replaced by it:
// a path that climbs out would write, or delete, elsewhere in the project.
function assertInsideSkill(path) {
    if (path.split('/').every(isPlainSegment))
        return;
    throw new Error(`skill file path: received ${JSON.stringify(path)}, expected a relative path with "/" separators and no "." or ".." segment`);
}
function foldersOf(path) {
    const segments = path.split('/');
    return segments.slice(1).map((_, depth) => segments.slice(0, depth + 1).join('/'));
}
// No disk holds a file and a folder under one name. A merge can ask for it
// (the project adds a file `notes`, the new version adds `notes/x.md`);
// refused here, the skill fails with these two names instead of an EEXIST
// from the middle of a write (found in review).
function assertNoFileIsAFolder(paths) {
    const files = new Set(paths);
    for (const path of paths) {
        const clash = foldersOf(path).find((folder) => files.has(folder));
        if (clash === undefined)
            continue;
        throw new Error(`skill file path: ${JSON.stringify(clash)} is a file and also the folder of ${JSON.stringify(path)}; a skill cannot hold both`);
    }
}
function byCodeUnit([one], [other]) {
    return one < other ? -1 : 1;
}
function treeDigest(files) {
    const hash = createHash('sha256');
    for (const [path, file] of files)
        hash.update(`${path}\0${contentDigest(file.content)}\n`);
    return `sha256:${hash.digest('hex')}`;
}
export class SkillTree {
    /** `sha256:<hex>` - the format every written manifest depends on. */
    hash;
    files;
    constructor(files) {
        this.files = files;
        this.hash = treeDigest(files);
    }
    /**
     * Builds a tree from `[path, file]` pairs; refuses a path that leaves the folder.
     *
     * @example
     *   SkillTree.of([['SKILL.md', { content: Buffer.from('# x'), executable: false }]])
     */
    static of(entries) {
        const sorted = [...entries].sort(byCodeUnit);
        for (const [path] of sorted)
            assertInsideSkill(path);
        assertNoFileIsAFolder(sorted.map(([path]) => path));
        return new SkillTree(new Map(sorted));
    }
    paths() {
        return [...this.files.keys()];
    }
    entries() {
        return [...this.files.entries()];
    }
    file(path) {
        return this.files.get(path);
    }
    equals(other) {
        return this.hash === other.hash;
    }
    /**
     * The paths whose content differs between the two trees, sorted: edited, or
     * present on one side only.
     *
     * @example
     *   base.differingPaths(local) // => ['SKILL.md', 'references/java.md']
     */
    differingPaths(other) {
        const paths = new Set([...this.paths(), ...other.paths()]);
        return [...paths].filter((path) => !sameContent(this.file(path), other.file(path))).sort();
    }
}
