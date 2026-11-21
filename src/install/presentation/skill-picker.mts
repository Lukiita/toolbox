// The list a person picks skills from, when a project has none yet and named
// none: arrows to move, space to pick, enter to confirm (ADR-0003).
//
// Only the part that decides is here - what each key does to the list, and
// what the list looks like - so it can be tested without a terminal. Reading
// the keys and redrawing the screen is the CLI's (`src/cli/pick-skills.mts`).
// Written on Node's own readline rather than a prompt library: a dependency
// would land in the node_modules of every project that uses the toolbox, for
// a question asked once.

import type { CatalogEntry, SkillSelection } from '../application/skill-selection.mts';
import { ALL_FLAG } from './command-arguments.mts';

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
export function startPicker(entries: readonly CatalogEntry[]): PickerState {
  return { entries, cursor: 0, picked: new Set(), done: 'no' };
}

function toggled(picked: ReadonlySet<string>, name: string): Set<string> {
  const next = new Set(picked);
  if (!next.delete(name)) next.add(name);
  return next;
}

// One key picks everything; pressed with everything picked, it clears.
function allOrNone({ entries, picked }: PickerState): Set<string> {
  return new Set(picked.size === entries.length ? [] : entries.map((entry) => entry.name));
}

const PRESSES: Record<PickerKey, (state: PickerState) => PickerState> = {
  // Wraps at both ends, like every list this one imitates.
  up: (state) => ({ ...state, cursor: (state.cursor || state.entries.length) - 1 }),
  down: (state) => ({ ...state, cursor: (state.cursor + 1) % state.entries.length }),
  toggle: (state) => ({
    ...state,
    picked: toggled(state.picked, state.entries[state.cursor].name),
  }),
  all: (state) => ({ ...state, picked: allOrNone(state) }),
  confirm: (state) => ({ ...state, done: 'confirmed' }),
  cancel: (state) => ({ ...state, done: 'cancelled' }),
};

/**
 * The picker after one key. A closed picker takes no key.
 *
 * @example
 *   pressKey(pressKey(startPicker(catalog), 'down'), 'toggle')
 */
export function pressKey(state: PickerState, key: PickerKey): PickerState {
  return state.done === 'no' ? PRESSES[key](state) : state;
}

const KEYS = new Map<string, PickerKey>([
  ['up', 'up'],
  ['k', 'up'],
  ['down', 'down'],
  ['j', 'down'],
  ['space', 'toggle'],
  ['a', 'all'],
  ['return', 'confirm'],
  ['enter', 'confirm'],
  ['escape', 'cancel'],
  ['q', 'cancel'],
]);

/**
 * What a key of Node's `keypress` event means to the picker; undefined for a
 * key it does not use.
 *
 * @example
 *   keyOf('space', false) // => 'toggle'
 */
export function keyOf(name: string | undefined, ctrl: boolean): PickerKey | undefined {
  // Raw mode hands Ctrl+C to the program as a key: it must still get out.
  if (ctrl) return name === 'c' ? 'cancel' : undefined;
  return KEYS.get(name ?? '');
}

/**
 * The skills picked, in the order of the list.
 *
 * @example
 *   pickedSelection(state) // => { names: ['code-review', 'retro'], all: false }
 */
export function pickedSelection({ entries, picked }: PickerState): SkillSelection {
  const names = entries.map((entry) => entry.name).filter((name) => picked.has(name));
  return { names, all: false };
}

// Never as wide as the terminal: a full-width line wraps on some terminals,
// and a wrapped line is two rows for a redraw that counts one per line.
function fitted(line: string, width: number): string {
  return line.length < width ? line : `${line.slice(0, width - 2)}…`;
}

function closedLine(state: PickerState): string {
  if (state.done === 'cancelled') return 'Cancelled: nothing picked.';
  const { names } = pickedSelection(state);
  return names.length === 0 ? 'No skill picked.' : `Skills picked: ${names.join(', ')}`;
}

// One layout for the list, wherever it is shown: the names in a column, the
// line about each skill after it.
function listed(entries: readonly CatalogEntry[], before: (index: number) => string): string[] {
  const nameWidth = Math.max(...entries.map((entry) => entry.name.length));
  return entries.map(({ name, summary }, index) =>
    `${before(index)}${name.padEnd(nameWidth)}   ${summary}`.trimEnd(),
  );
}

function titleOf(version: string): string {
  return `Skills in @lukiita/toolbox ${version}`;
}

// The skills the package ships, one per line with a line about each: what a
// script or an agent is shown, inside `selectionRequiredLines`.
function catalogLines(catalog: readonly CatalogEntry[], version: string): string[] {
  return [`${titleOf(version)}:`, ...listed(catalog, () => '  ')];
}

/**
 * What a script or an agent is told when the project has no skill yet and the
 * command named none: there is no terminal to pick in, and guessing "all of
 * them" would undo the point of picking.
 *
 * @example
 *   throw new SkillCommandUsageError(selectionRequiredLines(catalog, '2.0.0').join('\n'))
 */
export function selectionRequiredLines(
  catalog: readonly CatalogEntry[],
  version: string,
): string[] {
  return [
    `this project has no skill from the toolbox yet: name the ones it gets, or pass ${ALL_FLAG}.`,
    ...catalogLines(catalog, version),
  ];
}

function openLines(state: PickerState, version: string): string[] {
  const rows = listed(state.entries, (index) => {
    const cursor = index === state.cursor ? '❯' : ' ';
    const mark = state.picked.has(state.entries[index].name) ? '◉' : '◯';
    return `${cursor} ${mark} `;
  });
  return [
    `${titleOf(version)} - which ones does this project get?`,
    ...rows,
    `↑↓ move · space pick · a all · enter confirm (${state.picked.size} picked) · esc cancel`,
  ];
}

/**
 * What the picker shows: the list while it is open, one line once it closed.
 *
 * @example
 *   pickerLines(state, { version: '2.0.0', width: process.stdout.columns })
 */
export function pickerLines(state: PickerState, { version, width }: PickerFrame): string[] {
  const lines = state.done === 'no' ? openLines(state, version) : [closedLine(state)];
  return lines.map((line) => fitted(line, width));
}
