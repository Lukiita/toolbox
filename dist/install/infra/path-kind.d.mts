export type PathKind = 'absent' | 'link' | 'folder' | 'file' | 'other';
/**
 * @example
 *   pathKind('/p/.agents/skills/retro') // => 'link' for a symlink, whatever it points at
 */
export declare function pathKind(path: string): PathKind;
