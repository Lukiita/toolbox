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
import { isBinary, sameContent, SkillTree } from "./skill-tree.vo.mjs";
function isText(file) {
    return file !== undefined && !isBinary(file.content);
}
// Reached only when the three sides differ. A side that is absent (edited
// here, deleted there; or added on both sides) or binary has no line-level
// answer: the project's side stays and a person decides.
function mergeDiverged({ base, ours, theirs }, mergeText) {
    if (!isText(base) || !isText(ours) || !isText(theirs))
        return { file: ours, outcome: 'conflict' };
    const result = mergeText({
        base: base.content.toString('utf8'),
        ours: ours.content.toString('utf8'),
        theirs: theirs.content.toString('utf8'),
    });
    const file = { content: Buffer.from(result.text, 'utf8'), executable: ours.executable };
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
