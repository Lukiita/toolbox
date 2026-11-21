// The three-way merge of a skill the project edited with the new version the
// package ships (ADR-0003). Three sides: `base` is the original the project
// copied, `ours` is the project's folder now, `theirs` is the new version.
//
// File by file, the base says who moved. Only one side moved: that side wins,
// whether the move was an edit, a new file or a deletion. Both moved the same
// way: nothing to do. Both moved differently: the text merge decides, line by
// line, and what it cannot settle is a conflict.
//
// A conflict never loses the project's side: the merged tree carries the
// project's file (or its absence), with markers only where the text merge
// wrote them. Whether a tree with conflicts is written at all is the
// caller's call (`reconcile-skill.mts`).
import { isBinary, sameContent, SkillTree, withUnixLineEndings, } from "./skill-tree.mjs";
function isText(file) {
    return file !== undefined && !isBinary(file.content);
}
// latin1 on the way in and on the way out: every byte is one code unit and
// comes back as itself, whatever the file's encoding. The hash reads text the
// same way (skill-tree.mts). Decoded as UTF-8, a file saved in Windows-1252
// came back from a clean merge with each accent replaced by U+FFFD (found in
// review). The line merge only needs line breaks, and those are ASCII.
const BYTES = 'latin1';
function unixText(file) {
    return withUnixLineEndings(file.content.toString(BYTES));
}
// Merged as LF, written back the way the project keeps the file: a CRLF
// checkout (`core.autocrlf`) stays CRLF, or git would show every line changed.
function inLineEndingsOf(file, text) {
    const crlf = file.content.includes('\r\n');
    return Buffer.from(crlf ? text.replaceAll('\n', '\r\n') : text, BYTES);
}
// Reached only when the three sides differ. A side that is absent (edited
// here, deleted there; or added on both sides) or binary has no line-level
// answer: the project's side stays and a person decides.
function mergeDiverged({ base, ours, theirs }, mergeText) {
    if (!isText(base) || !isText(ours) || !isText(theirs))
        return { file: ours, outcome: 'conflict' };
    const result = mergeText({
        base: unixText(base),
        ours: unixText(ours),
        theirs: unixText(theirs),
    });
    const file = { content: inLineEndingsOf(ours, result.text), executable: ours.executable };
    return { file, outcome: result.conflicted ? 'conflict' : 'merged' };
}
function mergeFile(sides, mergeText) {
    const { base, ours, theirs } = sides;
    if (sameContent(ours, theirs) || sameContent(theirs, base))
        return { file: ours, outcome: 'kept' };
    if (sameContent(ours, base))
        return { file: theirs, outcome: 'taken' };
    return mergeDiverged(sides, mergeText);
}
function allPaths({ base, ours, theirs }) {
    return [...new Set([...base.paths(), ...ours.paths(), ...theirs.paths()])].sort();
}
/**
 * Merges the new version of a skill into the project's edited copy.
 *
 * @example
 *   mergeSkillTrees({ base, ours: local, theirs: shipped }, gitTextMerge)
 *   // => { tree, merged: ['SKILL.md'], conflicts: [] }
 */
export function mergeSkillTrees(sides, mergeText) {
    const entries = [];
    const paths = { kept: [], taken: [], merged: [], conflict: [] };
    for (const path of allPaths(sides)) {
        const fileSides = {
            base: sides.base.file(path),
            ours: sides.ours.file(path),
            theirs: sides.theirs.file(path),
        };
        const { file, outcome } = mergeFile(fileSides, mergeText);
        paths[outcome].push(path);
        if (file)
            entries.push([path, file]);
    }
    return { tree: SkillTree.of(entries), merged: paths.merged, conflicts: paths.conflict };
}
