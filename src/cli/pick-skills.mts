// The terminal side of the skill picker: reads keys one at a time and redraws
// the list in place. What a key does and what the list looks like are decided
// in `src/install/presentation/skill-picker.mts`, where they are tested; this
// file is process glue (raw mode, escape codes) with no unit test by design,
// like the rest of `src/cli/`.

import { emitKeypressEvents } from 'node:readline';

import {
  type CatalogEntry,
  keyOf,
  pickedSelection,
  pickerLines,
  type PickerState,
  pressKey,
  type SkillSelection,
  startPicker,
} from '../install/index.mts';

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

/** One picker on the process's terminal, from the first frame to the answer. */
class TerminalPicker {
  private state: PickerState;
  private readonly version: string;
  private drawn = 0;

  public constructor(catalog: readonly CatalogEntry[], version: string) {
    this.state = startPicker(catalog);
    this.version = version;
  }

  /** Resolves with what was picked, or with undefined when the picker was closed without confirming. */
  public run(): Promise<SkillSelection | undefined> {
    return new Promise((resolve, reject) => {
      const onKey = (_text: string | undefined, key: Keypress = {}): void => {
        try {
          if (this.press(key)) this.close(onKey, resolve);
        } catch (e) {
          this.restore(onKey);
          reject(e);
        }
      };
      this.open(onKey);
    });
  }

  private open(onKey: (text: string | undefined, key?: Keypress) => void): void {
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('keypress', onKey);
    // Whatever ends the process while the list is open, the cursor comes back.
    process.once('exit', this.showCursor);
    process.stdout.write(HIDE_CURSOR);
    this.draw();
  }

  // Applies one key and redraws; true once the picker is closed.
  private press(key: Keypress): boolean {
    const pressed = keyOf(key.name, key.ctrl === true);
    if (!pressed) return false;
    this.state = pressKey(this.state, pressed);
    this.draw();
    return this.state.done !== 'no';
  }

  private draw(): void {
    const width = process.stdout.columns ?? 80;
    const lines = pickerLines(this.state, { version: this.version, width });
    process.stdout.write(`${eraseLines(this.drawn)}${lines.join('\n')}\n`);
    this.drawn = lines.length;
  }

  private close(
    onKey: (text: string | undefined, key?: Keypress) => void,
    resolve: (picked: SkillSelection | undefined) => void,
  ): void {
    this.restore(onKey);
    resolve(this.state.done === 'confirmed' ? pickedSelection(this.state) : undefined);
  }

  // The terminal goes back as it was, whatever the answer: raw mode left on
  // swallows the shell's own keys after the command exits.
  private restore(onKey: (text: string | undefined, key?: Keypress) => void): void {
    process.stdin.off('keypress', onKey);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.off('exit', this.showCursor);
    this.showCursor();
  }

  private readonly showCursor = (): void => {
    process.stdout.write(SHOW_CURSOR);
  };
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
  catalog: readonly CatalogEntry[],
  version: string,
): Promise<SkillSelection | undefined> {
  return new TerminalPicker(catalog, version).run();
}
