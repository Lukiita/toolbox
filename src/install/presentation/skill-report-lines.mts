// The lines `toolbox install` and `toolbox skills` print: plain text for a
// person (or an agent) reading a terminal. One place for the wording, so the
// two commands name a state the same way.

import { join } from 'node:path';

import type { SkillInspection } from '../application/inspect-skills.mts';
import type { InstallStatus, SkillInstallReport } from '../application/install-skills.mts';
import type { UpstreamState } from '../domain/skill-state.mts';
import { SKILLS_DIR } from '../application/skill-layout.mts';
import { WRITE_CONFLICTS_FLAG } from './install-arguments.mts';

// Empty = the status says it all. A line that asks something of the reader
// says what, in the line itself: nobody opens the docs for an install log.
const INSTALL_NOTES: Record<InstallStatus, string> = {
  copied: '',
  updated: '',
  unchanged: '',
  adopted: "already equal to the package's; now recorded",
  merged: "the new version was merged into the project's edits",
  // Not "with conflict markers" alone: a file edited here and deleted there,
  // added on both sides, or binary has no text to mark, and keeps the
  // project's side. The line once promised markers for those too (found in review).
  'conflict-marked':
    "written for you to settle: conflict markers where the text can carry them, the project's side kept elsewhere; check every file listed",
  altered: 'edited by the project; kept',
  available: 'shipped by the toolbox, not installed here; `toolbox install <name>` adds it',
  unmanaged: "the project's own folder; not managed by the toolbox",
  removed: 'deleted by the project; no longer installed (`toolbox install <name>` brings it back)',
  conflict: `the new version conflicts with the project's edits; nothing was written (\`toolbox install ${WRITE_CONFLICTS_FLAG}\` writes the merge for you to settle)`,
  'no-original':
    'edited by the project; the new version was not merged and nothing was written, because the original could not be read',
  ahead: 'recorded by a newer toolbox than the one running; update the package',
  pinned: "the project's own link; not replaced",
  retired: 'no longer shipped by the toolbox; delete it if unused',
  failed: 'could not be settled; the other skills were',
};

const STATUS_WIDTH = 'conflict-marked: '.length;
const STATE_WIDTH = 'altered, retired  '.length;

function inBrackets(files: readonly string[]): string {
  return files.length === 0 ? '' : ` [${files.join(', ')}]`;
}

/**
 * One line of `toolbox install`.
 *
 * @example
 *   installLine({ name: 'retro', status: 'copied', files: [] })
 *   // => 'copied:          .agents/skills/retro'
 */
export function installLine({ name, status, files, reason }: SkillInstallReport): string {
  const note = [INSTALL_NOTES[status], reason].filter(Boolean).join(': ');
  const subject = `${join(SKILLS_DIR, name)}${inBrackets(files)}`;
  return `${`${status}:`.padEnd(STATUS_WIDTH)}${subject}${note ? ` - ${note}` : ''}`;
}

/**
 * One line for every skill the project did not pick, instead of one each: a
 * project with three skills should not read thirteen lines about the rest.
 *
 * @example
 *   availableLine(['retro', 'sql-quality'])
 *   // => 'available:       retro, sql-quality - shipped by the toolbox, not installed here; …'
 */
export function availableLine(names: readonly string[]): string {
  return `${'available:'.padEnd(STATUS_WIDTH)}${names.join(', ')} - ${INSTALL_NOTES.available}`;
}

// `current` and `untracked` add nothing to the project's side of the story.
const UPSTREAM_WORTH_NAMING: readonly UpstreamState[] = ['behind', 'ahead', 'retired'];

function stateLabel({ local, upstream }: SkillInspection): string {
  return UPSTREAM_WORTH_NAMING.includes(upstream) ? `${local}, ${upstream}` : local;
}

function fileLine(label: string, files: readonly string[]): string[] {
  return files.length === 0 ? [] : [`    ${label}: ${files.join(', ')}`];
}

/**
 * The lines of `toolbox skills` for one skill: its state, then the files that differ.
 *
 * @example
 *   inspectionLines(inspection)
 *   // => ['altered           ddd-tactical (1.2.0)', '    edited by the project: SKILL.md']
 */
export function inspectionLines(inspection: SkillInspection): string[] {
  const { name, version, alteredFiles, behindFiles, divergedFiles } = inspection;
  const head = `${stateLabel(inspection).padEnd(STATE_WIDTH)}${name}${version ? ` (${version})` : ''}`;
  return [
    head,
    ...fileLine('edited by the project', alteredFiles),
    ...fileLine('changed in the toolbox', behindFiles),
    ...fileLine('differs from the toolbox (edits and new version together)', divergedFiles),
  ];
}
