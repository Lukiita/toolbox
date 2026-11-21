// What a shipped skill says about itself, read from its own files: a one-line
// summary, for whoever picks which skills a project gets, and the sibling
// skills it reaches (ADR-0003). A project installs a selection, and a skill
// installed without the sibling it calls has a dead path in it - so adding a
// skill adds what it needs.

import { isBinary, type SkillTree } from './skill-tree.mts';

/**
 * How a skill reaches a sibling: `<skill-dir>/../<name>/…`. One definition,
 * shared with the test that keeps every shipped reference alive.
 */
export const SIBLING_REFERENCE = /<skill-dir>\/\.\.\/([a-z0-9-]+)\/([\w./-]*)/g;

const DESCRIPTION = /^description:\s*(.+)$/m;
const SUMMARY_WIDTH = 80;

export interface SkillDescription {
  /** The first sentence of the skill's description; empty when it has none. */
  summary: string;
  /** The sibling skills its files reach, sorted. */
  needs: string[];
}

// The longest run of whole words that fits, then "...".
function cutOnAWord(sentence: string): string {
  if (sentence.length <= SUMMARY_WIDTH) return sentence;
  const cut = sentence.slice(0, SUMMARY_WIDTH - '...'.length);
  return `${cut.slice(0, cut.lastIndexOf(' '))}...`;
}

function descriptionOf(tree: SkillTree): string {
  const text = tree.file('SKILL.md')?.content.toString('utf8') ?? '';
  const written = DESCRIPTION.exec(text)?.[1] ?? '';
  return written.replace(/^["']|["']$/g, '');
}

function firstSentence(text: string): string {
  return /^.*?\.(?=\s|$)/.exec(text)?.[0] ?? text;
}

function summaryOf(tree: SkillTree): string {
  return cutOnAWord(firstSentence(descriptionOf(tree)).trim());
}

function siblingsIn(text: string): string[] {
  return [...text.matchAll(SIBLING_REFERENCE)].map(([, sibling]) => sibling);
}

function siblingReferences(tree: SkillTree): string[] {
  const texts = tree
    .entries()
    .filter(([, file]) => !isBinary(file.content))
    .map(([, file]) => file.content.toString('utf8'));
  return [...new Set(texts.flatMap(siblingsIn))].sort();
}

/**
 * The catalog entry of a shipped skill.
 *
 * @example
 *   describeSkill(shipped)
 *   // => { summary: 'Reviews the branch diff against its base.', needs: ['sql-quality'] }
 */
export function describeSkill(tree: SkillTree): SkillDescription {
  return { summary: summaryOf(tree), needs: siblingReferences(tree) };
}
