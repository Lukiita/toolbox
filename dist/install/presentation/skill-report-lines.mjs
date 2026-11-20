// The lines `toolbox install` and `toolbox skills` print: plain text for a
// person (or an agent) reading a terminal. One place for the wording, so the
// two commands name a state the same way.
import { join } from 'node:path';
import { SKILLS_DIR } from "../infra/skill-layout.mjs";
// Empty = the status says it all. A line that asks something of the reader
// says what, in the line itself: nobody opens the docs for an install log.
const INSTALL_NOTES = {
    copied: '',
    updated: '',
    unchanged: '',
    adopted: "already equal to the package's; now recorded",
    merged: "the new version was merged into the project's edits",
    'conflict-marked': 'written with conflict markers; resolve them by hand',
    altered: 'edited by the project; kept',
    unmanaged: "the project's own folder; not managed by the toolbox",
    removed: 'deleted by the project; not restored',
    conflict: "the new version conflicts with the project's edits; nothing was written (`toolbox install --write-conflicts` writes the conflict markers)",
    'no-original': 'edited by the project; the new version was not merged and nothing was written, because the original could not be read',
    ahead: 'recorded by a newer toolbox than the one running; update the package',
    pinned: "the project's own link; not replaced",
    retired: 'no longer shipped by the toolbox; delete it if unused',
};
const STATUS_WIDTH = 'conflict-marked: '.length;
const STATE_WIDTH = 'altered, retired  '.length;
function inBrackets(files) {
    return files.length === 0 ? '' : ` [${files.join(', ')}]`;
}
/**
 * One line of `toolbox install`.
 *
 * @example
 *   installLine({ name: 'retro', status: 'copied', files: [] })
 *   // => 'copied:          .agents/skills/retro'
 */
export function installLine({ name, status, files, reason }) {
    const note = [INSTALL_NOTES[status], reason].filter(Boolean).join(': ');
    const subject = `${join(SKILLS_DIR, name)}${inBrackets(files)}`;
    return `${`${status}:`.padEnd(STATUS_WIDTH)}${subject}${note ? ` - ${note}` : ''}`;
}
// `current` and `untracked` add nothing to the project's side of the story.
const UPSTREAM_WORTH_NAMING = ['behind', 'ahead', 'retired'];
function stateLabel({ local, upstream }) {
    return UPSTREAM_WORTH_NAMING.includes(upstream) ? `${local}, ${upstream}` : local;
}
function fileLine(label, files) {
    return files.length === 0 ? [] : [`    ${label}: ${files.join(', ')}`];
}
/**
 * The lines of `toolbox skills` for one skill: its state, then the files that differ.
 *
 * @example
 *   inspectionLines(inspection)
 *   // => ['altered           ddd-tactical (1.2.0)', '    edited by the project: SKILL.md']
 */
export function inspectionLines(inspection) {
    const { name, version, alteredFiles, behindFiles, divergedFiles } = inspection;
    const head = `${stateLabel(inspection).padEnd(STATE_WIDTH)}${name}${version ? ` (${version})` : ''}`;
    return [
        head,
        ...fileLine('edited by the project', alteredFiles),
        ...fileLine('changed in the toolbox', behindFiles),
        ...fileLine('differs from the toolbox (edits and new version together)', divergedFiles),
    ];
}
