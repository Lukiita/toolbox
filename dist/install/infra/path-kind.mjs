// What is at a path, without following a symbolic link there.
//
// The one question every read and write of this feature asks first
// (ADR-0003). `existsSync`, `statSync`, `readFileSync` and `writeFileSync`
// all answer for a link's target, and a project is somebody else's content: a
// link committed under a name the toolbox uses made it delete, then
// overwrite, files outside the project - found by three reviews in a row,
// one name at a time. So the kind of the entry is read here, with `lstat`,
// and each caller decides what a link means for it: unlinked, refused, or
// left alone. Only the last component of the path is not followed: a project
// whose `.agents/` is itself a link elsewhere keeps working.
import { lstatSync } from 'node:fs';
/**
 * @example
 *   pathKind('/p/.agents/skills/retro') // => 'link' for a symlink, whatever it points at
 */
export function pathKind(path) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat)
        return 'absent';
    if (stat.isSymbolicLink())
        return 'link';
    if (stat.isDirectory())
        return 'folder';
    return stat.isFile() ? 'file' : 'other';
}
