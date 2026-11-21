// The list a person picks skills from, when a project has none yet and named
// none: arrows to move, space to pick, enter to confirm (ADR-0003).
//
// Only the part that decides is here - what each key does to the list, and
// what the list looks like - so it can be tested without a terminal. Reading
// the keys and redrawing the screen is the CLI's (`src/cli/pick-skills.mts`).
// Written on Node's own readline rather than a prompt library: a dependency
// would land in the node_modules of every project that uses the toolbox, for
// a question asked once.
/**
 * The picker as it opens: the cursor on the first skill, nothing picked.
 *
 * @example
 *   startPicker(skillCatalog(folders))
 */
export function startPicker(entries) {
    return { entries, cursor: 0, picked: new Set(), done: 'no' };
}
function toggled(picked, name) {
    const next = new Set(picked);
    if (!next.delete(name))
        next.add(name);
    return next;
}
// One key picks everything; pressed with everything picked, it clears.
function allOrNone({ entries, picked }) {
    return new Set(picked.size === entries.length ? [] : entries.map((entry) => entry.name));
}
const PRESSES = {
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
export function pressKey(state, key) {
    return state.done === 'no' ? PRESSES[key](state) : state;
}
const KEYS = new Map([
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
export function keyOf(name, ctrl) {
    // Raw mode hands Ctrl+C to the program as a key: it must still get out.
    if (ctrl)
        return name === 'c' ? 'cancel' : undefined;
    return KEYS.get(name ?? '');
}
/**
 * The skills picked, in the order of the list.
 *
 * @example
 *   pickedSelection(state) // => { names: ['code-review', 'retro'], all: false }
 */
export function pickedSelection({ entries, picked }) {
    const names = entries.map((entry) => entry.name).filter((name) => picked.has(name));
    return { names, all: false };
}
// Never as wide as the terminal: a full-width line wraps on some terminals,
// and a wrapped line is two rows for a redraw that counts one per line.
function fitted(line, width) {
    return line.length < width ? line : `${line.slice(0, width - 2)}…`;
}
function closedLine(state) {
    if (state.done === 'cancelled')
        return 'Cancelled: nothing picked.';
    const { names } = pickedSelection(state);
    return names.length === 0 ? 'No skill picked.' : `Skills picked: ${names.join(', ')}`;
}
// One layout for the list, wherever it is shown: the names in a column, the
// line about each skill after it.
function listed(entries, before) {
    const nameWidth = Math.max(...entries.map((entry) => entry.name.length));
    return entries.map(({ name, summary }, index) => `${before(index)}${name.padEnd(nameWidth)}   ${summary}`.trimEnd());
}
function titleOf(version) {
    return `Skills in @lukiita/toolbox ${version}`;
}
/**
 * The skills the package ships, one per line with a line about each: what a
 * script or an agent is shown when a project has no skill yet and named
 * none. A person at a terminal gets the picker instead.
 *
 * @example
 *   catalogLines(catalog, '2.0.0').forEach((line) => console.error(line))
 */
export function catalogLines(catalog, version) {
    return [`${titleOf(version)}:`, ...listed(catalog, () => '  ')];
}
function openLines(state, version) {
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
export function pickerLines(state, { version, width }) {
    const lines = state.done === 'no' ? openLines(state, version) : [closedLine(state)];
    return lines.map((line) => fitted(line, width));
}
