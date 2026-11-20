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

import { isBinary, sameContent, type SkillFile, SkillTree } from './skill-tree.vo.mts';

export interface TextSides {
  base: string;
  ours: string;
  theirs: string;
}

export interface TextMergeResult {
  /** The merged text; with conflict markers when `conflicted`. */
  text: string;
  conflicted: boolean;
}

/** The line-level merge, behind a port: git does it (`infra/git-text-merge.mts`). */
export type TextMerge = (sides: TextSides) => TextMergeResult;

export interface TreeSides {
  base: SkillTree;
  ours: SkillTree;
  theirs: SkillTree;
}

export interface TreeMerge {
  tree: SkillTree;
  /** Files both sides edited and the text merge settled. */
  merged: string[];
  /** Files both sides moved and nothing could settle; `tree` holds the project's side. */
  conflicts: string[];
}

interface FileSides {
  base: SkillFile | undefined;
  ours: SkillFile | undefined;
  theirs: SkillFile | undefined;
}

type FileOutcome = 'kept' | 'taken' | 'merged' | 'conflict';

interface FileMerge {
  file: SkillFile | undefined;
  outcome: FileOutcome;
}

function isText(file: SkillFile | undefined): file is SkillFile {
  return file !== undefined && !isBinary(file.content);
}

// Reached only when the three sides differ. A side that is absent (edited
// here, deleted there; or added on both sides) or binary has no line-level
// answer: the project's side stays and a person decides.
function mergeDiverged({ base, ours, theirs }: FileSides, mergeText: TextMerge): FileMerge {
  if (!isText(base) || !isText(ours) || !isText(theirs)) return { file: ours, outcome: 'conflict' };
  const result = mergeText({
    base: base.content.toString('utf8'),
    ours: ours.content.toString('utf8'),
    theirs: theirs.content.toString('utf8'),
  });
  const file = { content: Buffer.from(result.text, 'utf8'), executable: ours.executable };
  return { file, outcome: result.conflicted ? 'conflict' : 'merged' };
}

function mergeFile(sides: FileSides, mergeText: TextMerge): FileMerge {
  const { base, ours, theirs } = sides;
  if (sameContent(ours, theirs) || sameContent(theirs, base))
    return { file: ours, outcome: 'kept' };
  if (sameContent(ours, base)) return { file: theirs, outcome: 'taken' };
  return mergeDiverged(sides, mergeText);
}

function allPaths({ base, ours, theirs }: TreeSides): string[] {
  return [...new Set([...base.paths(), ...ours.paths(), ...theirs.paths()])].sort();
}

/**
 * Merges the new version of a skill into the project's edited copy.
 *
 * @example
 *   mergeSkillTrees({ base, ours: local, theirs: shipped }, gitTextMerge)
 *   // => { tree, merged: ['SKILL.md'], conflicts: [] }
 */
export function mergeSkillTrees(sides: TreeSides, mergeText: TextMerge): TreeMerge {
  const entries: [string, SkillFile][] = [];
  const paths: Record<FileOutcome, string[]> = { kept: [], taken: [], merged: [], conflict: [] };
  for (const path of allPaths(sides)) {
    const fileSides = {
      base: sides.base.file(path),
      ours: sides.ours.file(path),
      theirs: sides.theirs.file(path),
    };
    const { file, outcome } = mergeFile(fileSides, mergeText);
    paths[outcome].push(path);
    if (file) entries.push([path, file]);
  }
  return { tree: SkillTree.of(entries), merged: paths.merged, conflicts: paths.conflict };
}
