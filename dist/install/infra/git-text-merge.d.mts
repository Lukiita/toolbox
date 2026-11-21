import type { TextMerge } from '../domain/merge-skill-trees.mts';
/**
 * Merges `theirs` into `ours` from their common `base`.
 *
 * @example
 *   gitTextMerge({ base, ours, theirs }) // => { text: '…', conflicted: false }
 */
export declare const gitTextMerge: TextMerge;
