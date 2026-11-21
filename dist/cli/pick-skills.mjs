// The terminal side of the skill picker: reads keys one at a time and redraws
// the list in place. What a key does and what the list looks like are decided
// in `src/install/presentation/skill-picker.mts`, where they are tested; this
// file is process glue (raw mode, escape codes) with no unit test by design,
// like the rest of `src/cli/`.
import { emitKeypressEvents } from 'node:readline';
import { keyOf, pickedSelection, pickerLines, pressKey, startPicker, } from "../install/index.mjs";
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
// Up over what was drawn, then clear to the end of the screen: the next
// frame is written over the last one instead of scrolling the terminal.
function eraseLines(count) {
    return count > 0 ? `\x1b[${count}A\x1b[0J` : '';
}
/** One picker on the process's terminal, from the first frame to the answer. */
class TerminalPicker {
    state;
    version;
    drawn = 0;
    constructor(catalog, version) {
        this.state = startPicker(catalog);
        this.version = version;
    }
    /** Resolves with what was picked, or with undefined when the picker was closed without confirming. */
    run() {
        return new Promise((resolve, reject) => {
            const onKey = (_text, key = {}) => {
                try {
                    if (this.press(key))
                        this.close(onKey, resolve);
                }
                catch (e) {
                    this.restore(onKey);
                    reject(e);
                }
            };
            this.open(onKey);
        });
    }
    open(onKey) {
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
    press(key) {
        const pressed = keyOf(key.name, key.ctrl === true);
        if (!pressed)
            return false;
        this.state = pressKey(this.state, pressed);
        this.draw();
        return this.state.done !== 'no';
    }
    draw() {
        const width = process.stdout.columns ?? 80;
        const lines = pickerLines(this.state, { version: this.version, width });
        process.stdout.write(`${eraseLines(this.drawn)}${lines.join('\n')}\n`);
        this.drawn = lines.length;
    }
    close(onKey, resolve) {
        this.restore(onKey);
        resolve(this.state.done === 'confirmed' ? pickedSelection(this.state) : undefined);
    }
    // The terminal goes back as it was, whatever the answer: raw mode left on
    // swallows the shell's own keys after the command exits.
    restore(onKey) {
        process.stdin.off('keypress', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.off('exit', this.showCursor);
        this.showCursor();
    }
    showCursor = () => {
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
export function pickSkills(catalog, version) {
    return new TerminalPicker(catalog, version).run();
}
