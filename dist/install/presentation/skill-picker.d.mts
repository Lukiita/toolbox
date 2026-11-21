import type { CatalogEntry, SkillSelection } from '../application/install-skills.mts';
export type PickerKey = 'up' | 'down' | 'toggle' | 'all' | 'confirm' | 'cancel';
export interface PickerState {
    entries: readonly CatalogEntry[];
    /** The row the cursor is on. */
    cursor: number;
    picked: ReadonlySet<string>;
    done: 'no' | 'confirmed' | 'cancelled';
}
export interface PickerFrame {
    /** The version of the running toolbox, for the title. */
    version: string;
    /** Columns of the terminal. */
    width: number;
}
/**
 * The picker as it opens: the cursor on the first skill, nothing picked.
 *
 * @example
 *   startPicker(skillCatalog(folders))
 */
export declare function startPicker(entries: readonly CatalogEntry[]): PickerState;
/**
 * The picker after one key. A closed picker takes no key.
 *
 * @example
 *   pressKey(pressKey(startPicker(catalog), 'down'), 'toggle')
 */
export declare function pressKey(state: PickerState, key: PickerKey): PickerState;
/**
 * What a key of Node's `keypress` event means to the picker; undefined for a
 * key it does not use.
 *
 * @example
 *   keyOf('space', false) // => 'toggle'
 */
export declare function keyOf(name: string | undefined, ctrl: boolean): PickerKey | undefined;
/**
 * The skills picked, in the order of the list.
 *
 * @example
 *   pickedSelection(state) // => { names: ['code-review', 'retro'], all: false }
 */
export declare function pickedSelection({ entries, picked }: PickerState): SkillSelection;
/**
 * What the picker shows: the list while it is open, one line once it closed.
 *
 * @example
 *   pickerLines(state, { version: '2.0.0', width: process.stdout.columns })
 */
export declare function pickerLines(state: PickerState, { version, width }: PickerFrame): string[];
