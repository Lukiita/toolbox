import { describe, expect, it } from 'vitest';

import {
  catalogLines,
  keyOf,
  pickedSelection,
  pickerLines,
  type PickerKey,
  type PickerState,
  pressKey,
  selectionRequiredLines,
  startPicker,
} from './skill-picker.mts';

const CATALOG = [
  { name: 'code-review', summary: 'Reviews the branch diff.' },
  { name: 'ddd-tactical', summary: '' },
  { name: 'retro', summary: 'Looks back at a feature.' },
];

function after(...keys: PickerKey[]): PickerState {
  return keys.reduce(pressKey, startPicker(CATALOG));
}

describe('the skill picker - moving and picking', () => {
  it('starts on the first skill with nothing picked', () => {
    const state = startPicker(CATALOG);
    expect(state.cursor).toBe(0);
    expect(pickedSelection(state)).toEqual({ names: [], all: false });
    expect(state.done).toBe('no');
  });

  it('moves down and up, and wraps at both ends', () => {
    expect(after('down').cursor).toBe(1);
    expect(after('down', 'down', 'down').cursor).toBe(0);
    expect(after('up').cursor).toBe(2);
    expect(after('down', 'up').cursor).toBe(0);
  });

  it('picks the skill under the cursor, and unpicks it on a second press', () => {
    expect(pickedSelection(after('down', 'toggle')).names).toEqual(['ddd-tactical']);
    expect(pickedSelection(after('down', 'toggle', 'toggle')).names).toEqual([]);
  });

  it('hands the picked skills back in the order of the list, whatever order they were picked in', () => {
    const state = after('down', 'down', 'toggle', 'up', 'up', 'toggle');
    expect(pickedSelection(state)).toEqual({ names: ['code-review', 'retro'], all: false });
  });

  it('picks every skill with one key, and none when all were already picked', () => {
    expect(pickedSelection(after('all')).names).toEqual(['code-review', 'ddd-tactical', 'retro']);
    expect(pickedSelection(after('toggle', 'all')).names).toEqual([
      'code-review',
      'ddd-tactical',
      'retro',
    ]);
    expect(pickedSelection(after('all', 'all')).names).toEqual([]);
  });

  it('is confirmed or cancelled, and takes no key after that', () => {
    expect(after('toggle', 'confirm').done).toBe('confirmed');
    expect(after('cancel').done).toBe('cancelled');
    const confirmed = after('toggle', 'confirm');
    expect(pressKey(confirmed, 'down')).toBe(confirmed);
    expect(pressKey(confirmed, 'cancel')).toBe(confirmed);
  });
});

describe('the skill picker - keys', () => {
  it.each([
    ['up', false, 'up'],
    ['k', false, 'up'],
    ['down', false, 'down'],
    ['j', false, 'down'],
    ['space', false, 'toggle'],
    ['a', false, 'all'],
    ['return', false, 'confirm'],
    ['enter', false, 'confirm'],
    ['escape', false, 'cancel'],
    ['q', false, 'cancel'],
    ['c', true, 'cancel'],
  ] as const)('reads %s (ctrl: %s) as %s', (name, ctrl, expected) => {
    expect(keyOf(name, ctrl)).toBe(expected);
  });

  it.each([
    ['c', false],
    ['x', false],
    ['a', true],
    [undefined, false],
  ] as const)('ignores %s (ctrl: %s)', (name, ctrl) => {
    expect(keyOf(name, ctrl)).toBeUndefined();
  });
});

describe('the skill picker - what is drawn', () => {
  const frame = { version: '2.0.0', width: 100 };

  it('shows the list with the cursor, the marks and the keys', () => {
    expect(pickerLines(after('toggle', 'down'), frame)).toEqual([
      'Skills in @lukiita/toolbox 2.0.0 - which ones does this project get?',
      '  ◉ code-review    Reviews the branch diff.',
      '❯ ◯ ddd-tactical',
      '  ◯ retro          Looks back at a feature.',
      '↑↓ move · space pick · a all · enter confirm (1 picked) · esc cancel',
    ]);
  });

  // The list is redrawn in place by moving the cursor up one row per line:
  // a line that wraps is two rows, and the redraw would climb too little.
  it('cuts every line to the width of the terminal, so that none wraps', () => {
    const lines = pickerLines(startPicker(CATALOG), { version: '2.0.0', width: 30 });
    expect(lines).toEqual([
      'Skills in @lukiita/toolbox 2…',
      '❯ ◯ code-review    Reviews t…',
      '  ◯ ddd-tactical',
      '  ◯ retro          Looks bac…',
      '↑↓ move · space pick · a all…',
    ]);
    expect(lines.every((line) => line.length < 30)).toBe(true);
  });

  it('shows what was settled once the picker is closed', () => {
    expect(pickerLines(after('toggle', 'down', 'down', 'toggle', 'confirm'), frame)).toEqual([
      'Skills picked: code-review, retro',
    ]);
    expect(pickerLines(after('confirm'), frame)).toEqual(['No skill picked.']);
    expect(pickerLines(after('toggle', 'cancel'), frame)).toEqual(['Cancelled: nothing picked.']);
  });
});

describe('catalogLines', () => {
  it('lists the skills for whoever cannot use the picker, in the same columns', () => {
    expect(catalogLines(CATALOG, '2.0.0')).toEqual([
      'Skills in @lukiita/toolbox 2.0.0:',
      '  code-review    Reviews the branch diff.',
      '  ddd-tactical',
      '  retro          Looks back at a feature.',
    ]);
  });
});

describe('selectionRequiredLines', () => {
  it('says what to type, then lists what there is to name', () => {
    expect(selectionRequiredLines(CATALOG, '2.0.0')).toEqual([
      'this project has no skill from the toolbox yet: name the ones it gets, or pass --all.',
      'Skills in @lukiita/toolbox 2.0.0:',
      '  code-review    Reviews the branch diff.',
      '  ddd-tactical',
      '  retro          Looks back at a feature.',
    ]);
  });
});
