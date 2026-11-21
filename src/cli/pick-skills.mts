// The terminal side of the skill picker: reads keys one at a time and redraws
// the list in place. What a key does and what the list looks like are decided
// in `src/install/presentation/skill-picker.mts`, where they are tested; this
// file is process glue (raw mode, escape codes) with no unit test by design,
// like the rest of `src/cli/`.

import { emitKeypressEvents } from 'node:readline';

import {
  keyOf,
  pickedSelection,
  pickerLines,
  type PickerState,
  pressKey,
  type SkillSelection,
  startPicker,
} from '../install/index.mts';

type CatalogEntries = Parameters<typeof startPicker>[0];

interface Keypress {
  name?: string;
  ctrl?: boolean;
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

// Up over what was drawn, then clear to the end of the screen: the next
// frame is written over the last one instead of scrolling the terminal.
function eraseLines(count: number): string {
  return count > 0 ? `\x1b[${count}A\x1b[0J` : '';
}

/**
 * Shows the picker and resolves with what the person picked, or with
 * undefined when they closed it without confirming. Only call with a terminal
 * on both stdin and stdout.
 *
 * @example
 *   const picked = await pickSkills(skillCatalog(folders), '2.0.0');
 */
export function pickSkills(
  catalog: CatalogEntries,
  version: string,
): Promise<SkillSelection | undefined> {
  const { stdin, stdout } = process;
  let state: PickerState = startPicker(catalog);
  let drawn = 0;
  const draw = (): void => {
    const lines = pickerLines(state, { version, width: stdout.columns ?? 80 });
    stdout.write(`${eraseLines(drawn)}${lines.join('\n')}\n`);
    drawn = lines.length;
  };
  return new Promise((resolve) => {
    const onKey = (_text: string | undefined, key: Keypress = {}): void => {
      const pressed = keyOf(key.name, key.ctrl === true);
      if (!pressed) return;
      state = pressKey(state, pressed);
      draw();
      if (state.done === 'no') return;
      // The terminal goes back as it was, whatever the answer: raw mode left
      // on swallows the shell's own keys after the command exits.
      stdin.off('keypress', onKey);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(SHOW_CURSOR);
      resolve(state.done === 'confirmed' ? pickedSelection(state) : undefined);
    };
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKey);
    stdout.write(HIDE_CURSOR);
    draw();
  });
}
