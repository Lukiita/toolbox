import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from '../infra/scratch-dirs.fixtures.ts';

import {
  hasInstalledSkills,
  skillCatalog,
  type SkillInstallReport,
  UnknownSkillError,
} from './install-skills.mts';
import {
  scratchProject,
  type ScratchProject,
  SKILL_V1,
  statuses,
  writeFiles,
} from './install.fixtures.ts';

const scratch = scratchDirs('toolbox-install-');

const read = (path: string): string => readFileSync(path, 'utf8');
// sha256sum of "SKILL.md\0<sha256 of 'hello\n'>\n" - see skill-tree.test.ts.
const RETRO_HASH = 'sha256:c9a89a84ba57e7d9f7da6fce928f625d9d5705f00cfdb8aa6117dbd8d6d9122a';
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

/** Leaves in a skill's place the relative link the 1.x install wrote. */
function linkAsV1(project: ScratchProject, name: string): void {
  mkdirSync(project.local('.'), { recursive: true });
  symlinkSync(`../../node_modules/@lukiita/toolbox/skills/${name}`, project.local(name), 'dir');
}

const IN_JAVA = SKILL_V1.replace('first rule', 'first rule, in Java');
const REVISED = SKILL_V1.replace('last rule', 'last rule, revised');
/** The lines of SKILL_V1 with the project's edit and the package's, merged. */
const BOTH_EDITS = [
  '# Skill',
  '',
  'first rule, in Java',
  '',
  'middle',
  '',
  'last rule, revised',
  '',
];

describe('installSkills - first install', () => {
  it('copies every shipped skill into .agents/skills as real files, not links', () => {
    const project = scratchProject(scratch());
    const reports = project.install();
    expect(reports).toEqual([
      { name: 'code-review', status: 'copied', files: [] },
      { name: 'retro', status: 'copied', files: [] },
    ]);
    expect(lstatSync(project.local('code-review')).isSymbolicLink()).toBe(false);
    expect(lstatSync(project.local('code-review')).isDirectory()).toBe(true);
    expect(read(project.local('code-review/SKILL.md'))).toBe(SKILL_V1);
    expect(read(project.local('code-review/references/smells.md'))).toBe('smells v1\n');
    expect(existsSync(project.local('not-a-skill'))).toBe(false);
  });

  it('records, per skill, the toolbox version and the hash of the original', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    expect(project.records().retro).toEqual({ version: '1.2.0', hash: RETRO_HASH });
    expect(Object.keys(project.records())).toEqual(['code-review', 'retro']);
  });

  // No second copy of the skills in the project: the manifest is one file.
  it('adds to .agents nothing but the skills and one manifest file', () => {
    const project = scratchProject(scratch());
    project.install();
    expect(readdirSync(join(project.projectRoot, '.agents')).sort()).toEqual([
      'skills',
      'toolbox-skills.json',
    ]);
    expect(project.releases.asked).toEqual([]);
  });

  it('keeps the exec bit of a shipped script', () => {
    const project = scratchProject(scratch());
    project.ship('retro', { 'SKILL.md': 'hello\n', 'scripts/run.py': 'print(1)\n' });
    chmodSync(join(project.packageDir, 'skills/retro/scripts/run.py'), 0o755);
    project.install();
    expect(statSync(project.local('retro/scripts/run.py')).mode & 0o111).not.toBe(0);
  });

  it("leaves the project's own skills, with other names, untouched", () => {
    const project = scratchProject(scratch());
    writeFiles(project.local('db-change'), { 'SKILL.md': 'mine' });
    const reports = project.install();
    expect(read(project.local('db-change/SKILL.md'))).toBe('mine');
    expect(statuses(reports)).not.toHaveProperty('db-change');
  });

  it('copies through .agents/skills when that folder is itself a link to elsewhere', () => {
    const project = scratchProject(scratch());
    mkdirSync(join(project.projectRoot, '..', 'elsewhere', 'skills'), { recursive: true });
    symlinkSync('../../elsewhere/skills', join(project.projectRoot, '.agents', 'skills'), 'dir');
    project.install();
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
    expect(read(join(project.projectRoot, '..', 'elsewhere', 'skills', 'retro', 'SKILL.md'))).toBe(
      'hello\n',
    );
  });
});

describe('installSkills - the project picks its skills', () => {
  const only = (...names: string[]): { select: { names: string[]; all: boolean } } => ({
    select: { names, all: false },
  });

  it('copies the skills it asked for and leaves the rest available', () => {
    const project = scratchProject(scratch());

    const reports = project.install('1.2.0', only('retro'));

    expect(reports).toEqual([
      { name: 'code-review', status: 'available', files: [] },
      { name: 'retro', status: 'copied', files: [] },
    ]);
    expect(existsSync(project.local('code-review'))).toBe(false);
    expect(Object.keys(project.records())).toEqual(['retro']);
  });

  it('keeps the selection: a plain install updates what the project has and adds nothing', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0', only('retro'));
    project.ship('retro', { 'SKILL.md': 'new\n' });

    const reports = project.install('1.3.0');

    expect(statuses(reports)).toEqual({ 'code-review': 'available', retro: 'updated' });
    expect(existsSync(project.local('code-review'))).toBe(false);
  });

  it('adds a skill named later to the ones the project has', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0', only('retro'));

    const reports = project.install('1.2.0', only('code-review'));

    expect(statuses(reports)).toEqual({ 'code-review': 'copied', retro: 'unchanged' });
  });

  it('copies everything when asked for all', () => {
    const project = scratchProject(scratch());
    const reports = project.install('1.2.0', { select: { names: [], all: true } });
    expect(statuses(reports)).toEqual({ 'code-review': 'copied', retro: 'copied' });
  });

  // A skill installed without the sibling it calls has a dead path in it.
  it('brings along the siblings a picked skill reaches, and says which skill needed them', () => {
    const project = scratchProject(scratch());
    project.ship('code-review', {
      'SKILL.md': 'load `<skill-dir>/../sql-quality/references/checklist.md`',
    });
    project.ship('sql-quality', { 'SKILL.md': 'see `<skill-dir>/../retro/SKILL.md`' });

    const reports = project.install('1.2.0', only('code-review'));

    expect(reports).toEqual([
      { name: 'code-review', status: 'copied', files: [] },
      { name: 'retro', status: 'copied', files: [], reason: 'needed by sql-quality' },
      { name: 'sql-quality', status: 'copied', files: [], reason: 'needed by code-review' },
    ]);
  });

  // Only on the way in: what the project deleted stays deleted.
  it('does not bring back a sibling the project deleted from a skill it already has', () => {
    const project = scratchProject(scratch());
    project.ship('code-review', { 'SKILL.md': 'load `<skill-dir>/../retro/SKILL.md`' });
    project.install('1.2.0', only('code-review'));
    rmSync(project.local('retro'), { recursive: true });
    project.install('1.2.0');

    const reports = project.install('1.2.0', only('code-review'));

    expect(statuses(reports)).toEqual({ 'code-review': 'unchanged', retro: 'available' });
  });

  it('reports a picked skill that cannot be read as failed, without looking for what it needs', () => {
    const project = scratchProject(scratch());
    project.ship('code-review', { 'SKILL.md': SKILL_V1, 'bad\\name.md': 'x' });

    const reports = project.install('1.2.0', only('code-review'));

    expect(statuses(reports)).toEqual({ 'code-review': 'failed', retro: 'available' });
  });

  // The line a deleted skill prints says `toolbox install <name>` brings it back.
  it('brings a deleted skill back in the same run it is asked for by name', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    rmSync(project.local('retro'), { recursive: true });

    const reports = project.install('1.2.0', only('retro'));

    expect(statuses(reports).retro).toBe('copied');
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
    expect(project.records().retro.version).toBe('1.2.0');
  });

  it('refuses a name the package does not ship, before touching anything', () => {
    const project = scratchProject(scratch());
    expect(() => project.install('1.2.0', only('retro', 'no-such-skill'))).toThrow(
      new UnknownSkillError(
        'unknown skill: received "no-such-skill", expected one of code-review, retro',
      ),
    );
    expect(existsSync(project.local('retro'))).toBe(false);
  });

  it("never copies over the project's own folder, even when its name was asked for", () => {
    const project = scratchProject(scratch());
    writeFiles(project.local('retro'), { 'SKILL.md': 'mine' });
    expect(statuses(project.install('1.2.0', only('retro'))).retro).toBe('unmanaged');
    expect(read(project.local('retro/SKILL.md'))).toBe('mine');
  });
});

describe('hasInstalledSkills', () => {
  it('is false in a project that never installed, true once it has a record', () => {
    const project = scratchProject(scratch());
    expect(hasInstalledSkills(project.folders)).toBe(false);
    project.install();
    expect(hasInstalledSkills(project.folders)).toBe(true);
  });

  it('is true for a project that only has links the 1.x install wrote', () => {
    const project = scratchProject(scratch());
    linkAsV1(project, 'retro');
    expect(hasInstalledSkills(project.folders)).toBe(true);
  });
});

describe('skillCatalog', () => {
  it('lists what the package ships, each with the first sentence of its description', () => {
    const project = scratchProject(scratch());
    project.ship('retro', {
      'SKILL.md':
        '---\nname: retro\ndescription: Looks back at a feature. Use after it ships.\n---\n',
    });
    expect(skillCatalog(project.folders)).toEqual([
      { name: 'code-review', summary: '' },
      { name: 'retro', summary: 'Looks back at a feature.' },
    ]);
  });
});

describe('installSkills - installing again, same version', () => {
  it('changes nothing: no file and no manifest is rewritten', () => {
    const project = scratchProject(scratch());
    project.install();
    const manifest = join(project.projectRoot, '.agents', 'toolbox-skills.json');
    const watched = [project.local('retro/SKILL.md'), manifest];
    const before = watched.map(read);
    for (const path of watched) utimesSync(path, LONG_AGO, LONG_AGO);

    const reports = project.install();

    expect(statuses(reports)).toEqual({ 'code-review': 'unchanged', retro: 'unchanged' });
    expect(watched.map(read)).toEqual(before);
    expect(watched.map((path) => statSync(path).mtime)).toEqual([LONG_AGO, LONG_AGO]);
  });

  it('keeps a skill the project edited, and reports it as altered', () => {
    const project = scratchProject(scratch());
    project.install();
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);

    const reports = project.install();

    expect(statuses(reports)).toEqual({ 'code-review': 'altered', retro: 'unchanged' });
    expect(read(project.local('code-review/SKILL.md'))).toBe(IN_JAVA);
    expect(project.releases.asked).toEqual([]);
  });

  it('does not read what a script run left in the folder as an edit', () => {
    const project = scratchProject(scratch());
    project.install();
    writeFiles(project.local('retro'), { 'scripts/__pycache__/run.cpython-312.pyc': 'bytecode' });
    expect(statuses(project.install()).retro).toBe('unchanged');
  });

  // Deleting the folder is how a project stops wanting a skill.
  it('does not bring back a skill the project deleted: its record goes, and it is only offered', () => {
    const project = scratchProject(scratch());
    project.install();
    rmSync(project.local('retro'), { recursive: true });

    expect(statuses(project.install()).retro).toBe('removed');
    expect(existsSync(project.local('retro'))).toBe(false);
    expect(project.records()).not.toHaveProperty('retro');

    expect(statuses(project.install()).retro).toBe('available');
    expect(existsSync(project.local('retro'))).toBe(false);
  });
});

describe('installSkills - a run that does not finish', () => {
  // A write killed between swapping the old folder out and the new one in.
  it('does not read a folder a dead run left swapped out as deleted by the project', () => {
    const project = scratchProject(scratch());
    project.install();
    // What the swap leaves when it dies after its first rename: the folder
    // aside, the marker naming it, and the new folder still in staging.
    renameSync(project.local('retro'), project.local('retro.toolbox-old'));
    writeFileSync(project.local('retro.toolbox-swap'), 'retro.toolbox-old');
    writeFiles(project.local('retro.toolbox-staging'), { 'SKILL.md': 'never moved in' });

    const reports = project.install();

    expect(statuses(reports).retro).toBe('unchanged');
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
    expect(readdirSync(project.local('.')).sort()).toEqual(['code-review', 'retro']);
  });

  // `code-review` cannot be read: one of its files has a name no tree accepts.
  // `retro`, after it in the alphabet, must still be settled.
  it('reports a skill that cannot be settled as failed, and settles the others', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    project.ship('code-review', { 'SKILL.md': SKILL_V1, 'bad\\name.md': 'x' });
    project.ship('retro', { 'SKILL.md': 'new\n' });

    const reports = project.install('1.3.0');

    expect(reports[0]).toMatchObject({ name: 'code-review', status: 'failed', files: [] });
    expect(reports[0].reason).toMatch(/^skill file path: received "bad\\\\name\.md"/);
    expect(reports[1]).toEqual({ name: 'retro', status: 'updated', files: [] });
    expect(read(project.local('retro/SKILL.md'))).toBe('new\n');
    expect(project.records()['code-review'].version).toBe('1.2.0');
    expect(project.records().retro.version).toBe('1.3.0');
  });

  // The manifest itself cannot be read: nothing can be settled, and the
  // records of an earlier run are not overwritten by an empty manifest.
  it('stops, and leaves the manifest as it was, when the manifest cannot be read', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    const manifest = join(project.projectRoot, '.agents', 'toolbox-skills.json');
    writeFileSync(manifest, '{ broken');

    expect(() => project.install('1.3.0')).toThrow(/toolbox-skills\.json/);
    expect(read(manifest)).toBe('{ broken');
  });

  it('hands over each report as the skill is settled, the retired ones last', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    rmSync(join(project.packageDir, 'skills', 'retro'), { recursive: true });
    project.reported.length = 0;

    const reports = project.install('1.3.0');

    expect(project.reported).toEqual(reports);
    expect(project.reported.map((report) => report.status)).toEqual(['unchanged', 'retired']);
  });
});

describe('installSkills - the package moved to a new version', () => {
  it('updates a skill the project did not edit, dropped files included', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    project.ship('code-review', { 'SKILL.md': REVISED });

    const reports = project.install('1.3.0');

    expect(reports[0]).toEqual({ name: 'code-review', status: 'updated', files: [] });
    expect(read(project.local('code-review/SKILL.md'))).toBe(REVISED);
    expect(existsSync(project.local('code-review/references/smells.md'))).toBe(false);
    expect(project.records()['code-review'].version).toBe('1.3.0');
    // An unedited skill is replaced: there is nothing to merge, so nothing to fetch.
    expect(project.releases.asked).toEqual([]);
  });

  it('moves the record of a skill whose content did not change to the new version', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    const reports = project.install('1.3.0');
    expect(statuses(reports).retro).toBe('unchanged');
    expect(project.records().retro).toEqual({ version: '1.3.0', hash: RETRO_HASH });
  });

  it("merges the new version into a skill the project edited, keeping both sides' changes", () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);
    project.ship('code-review', { 'SKILL.md': REVISED, 'references/smells.md': 'smells v2\n' });

    const reports = project.install('1.3.0');

    expect(reports[0]).toEqual({ name: 'code-review', status: 'merged', files: ['SKILL.md'] });
    expect(read(project.local('code-review/SKILL.md'))).toBe(BOTH_EDITS.join('\n'));
    expect(read(project.local('code-review/references/smells.md'))).toBe('smells v2\n');
    expect(project.records()['code-review'].version).toBe('1.3.0');
    // The original came from the release the manifest named, and only that one.
    expect(project.releases.asked).toEqual(['1.2.0']);
    // The edit is still an edit against the new original.
    expect(statuses(project.install('1.3.0'))['code-review']).toBe('altered');
  });

  // git's `core.autocrlf` on Windows: the project's files are CRLF, the
  // package's and the fetched release's are LF.
  it('merges into a skill checked out with CRLF, and keeps its line endings', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA.replaceAll('\n', '\r\n'));
    project.ship('code-review', { 'SKILL.md': REVISED, 'references/smells.md': 'smells v1\n' });

    const reports = project.install('1.3.0');

    expect(statuses(reports)['code-review']).toBe('merged');
    expect(read(project.local('code-review/SKILL.md'))).toBe(BOTH_EDITS.join('\r\n'));
  });

  it('leaves an edited skill exactly as it was when the new version conflicts with the edit', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    const mine = SKILL_V1.replace('middle', 'middle, in Java');
    writeFileSync(project.local('code-review/SKILL.md'), mine);
    project.ship('code-review', {
      'SKILL.md': SKILL_V1.replace('middle', 'middle, revised'),
      'references/smells.md': 'smells v2\n',
    });
    const recordedBefore = project.records()['code-review'];

    const reports = project.install('1.3.0');

    expect(reports[0]).toEqual({ name: 'code-review', status: 'conflict', files: ['SKILL.md'] });
    expect(read(project.local('code-review/SKILL.md'))).toBe(mine);
    // The whole skill waits, not only the conflicting file: half an update
    // is a version of the skill nobody wrote.
    expect(read(project.local('code-review/references/smells.md'))).toBe('smells v1\n');
    expect(project.records()['code-review']).toEqual(recordedBefore);
  });

  it('writes the conflict markers when asked to, and moves the record on', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    writeFileSync(
      project.local('code-review/SKILL.md'),
      SKILL_V1.replace('middle', 'middle, in Java'),
    );
    const revised = SKILL_V1.replace('middle', 'middle, revised');
    project.ship('code-review', { 'SKILL.md': revised, 'references/smells.md': 'smells v2\n' });

    const reports = project.install('1.3.0', { writeConflicts: true });

    expect(reports[0]).toEqual({
      name: 'code-review',
      status: 'conflict-marked',
      files: ['SKILL.md'],
    });
    expect(read(project.local('code-review/SKILL.md'))).toContain(
      [
        '<<<<<<< project',
        'middle, in Java',
        '||||||| base',
        'middle',
        '=======',
        'middle, revised',
        '>>>>>>> toolbox',
      ].join('\n'),
    );
    expect(read(project.local('code-review/references/smells.md'))).toBe('smells v2\n');
    expect(project.records()['code-review'].version).toBe('1.3.0');
  });

  it('does not merge when the release cannot be fetched: the edited skill is kept, with the reason', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);
    project.ship('code-review', { 'SKILL.md': REVISED });
    project.releases.lose('1.2.0');

    const reports = project.install('1.3.0');

    expect(reports[0]).toEqual({
      name: 'code-review',
      status: 'no-original',
      files: [],
      reason: 'could not fetch v1.2.0: no network',
    });
    expect(read(project.local('code-review/SKILL.md'))).toBe(IN_JAVA);
    expect(project.records()['code-review'].version).toBe('1.2.0');
    // The skills that needed no merge are not held back by the failed fetch.
    expect(statuses(reports).retro).toBe('unchanged');
    expect(project.records().retro.version).toBe('1.3.0');
  });

  // A tag fetched by git still has the test files package.json keeps out of
  // the package the project copied from.
  it('reads the fetched release as the package shipped it, test files aside', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    writeFiles(join(project.projectRoot, '..', 'releases', '1.2.0', 'skills', 'code-review'), {
      'scripts/test_validate.py': 'in the tag, never in the package',
    });
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);
    project.ship('code-review', { 'SKILL.md': REVISED, 'references/smells.md': 'smells v1\n' });

    expect(statuses(project.install('1.3.0'))['code-review']).toBe('merged');
    expect(existsSync(project.local('code-review/scripts/test_validate.py'))).toBe(false);
  });

  it('does not merge against a release that is not the one the manifest recorded', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    writeFiles(join(project.projectRoot, '..', 'releases', '1.2.0', 'skills', 'code-review'), {
      'SKILL.md': 'the tag was moved',
    });
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);
    project.ship('code-review', { 'SKILL.md': REVISED });

    const reports = project.install('1.3.0');

    expect(reports[0]).toEqual({
      name: 'code-review',
      status: 'no-original',
      files: [],
      reason: 'the 1.2.0 release holds other content for this skill than the manifest recorded',
    });
    expect(read(project.local('code-review/SKILL.md'))).toBe(IN_JAVA);
  });

  it('does not merge when the release has no such skill', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    rmSync(join(project.projectRoot, '..', 'releases', '1.2.0', 'skills', 'code-review'), {
      recursive: true,
    });
    writeFileSync(project.local('code-review/SKILL.md'), IN_JAVA);
    project.ship('code-review', { 'SKILL.md': REVISED });

    expect(project.install('1.3.0')[0]).toEqual({
      name: 'code-review',
      status: 'no-original',
      files: [],
      reason: 'the 1.2.0 release has no skill named code-review',
    });
  });

  it('disposes of what it fetched at the end of every run, a failed one included', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    expect(project.releases.disposals).toBe(1);
    writeFileSync(join(project.projectRoot, '.agents', 'toolbox-skills.json'), '{ broken');
    const plain = { select: { names: [], all: false } };
    expect(() => project.install('1.2.0', plain)).toThrow(/toolbox-skills\.json/);
    expect(project.releases.disposals).toBe(2);
  });

  // The project added a file `notes`; the new version adds `notes/x.md`. No
  // disk holds both: the skill fails with the two names, and nothing is left
  // half-written beside it.
  it('fails, with the reason, a merge that would need a file and a folder under one name', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    writeFiles(project.local('code-review'), { notes: 'mine' });
    project.ship('code-review', {
      'SKILL.md': SKILL_V1,
      'references/smells.md': 'smells v1\n',
      'notes/x.md': 'theirs',
    });

    const report = project.install('1.3.0')[0];

    expect(report).toMatchObject({ name: 'code-review', status: 'failed' });
    expect(report.reason).toBe(
      'skill file path: "notes" is a file and also the folder of "notes/x.md"; a skill cannot hold both',
    );
    expect(read(project.local('code-review/notes'))).toBe('mine');
    expect(readdirSync(project.local('.')).sort()).toEqual(['code-review', 'retro']);
  });

  // Saved in Windows-1252: 0xE7 0xE3 for "çã", which is not valid UTF-8.
  it('merges a text file that is not UTF-8 without rewriting a byte of it', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    const mine = Buffer.from(SKILL_V1.replace('first rule', 'descri\u00e7\u00e3o'), 'latin1');
    writeFileSync(project.local('code-review/SKILL.md'), mine);
    project.ship('code-review', { 'SKILL.md': REVISED, 'references/smells.md': 'smells v1\n' });

    expect(statuses(project.install('1.3.0'))['code-review']).toBe('merged');

    const merged = readFileSync(project.local('code-review/SKILL.md'));
    expect(merged).toEqual(
      Buffer.from(
        SKILL_V1.replace('first rule', 'descri\u00e7\u00e3o').replace(
          'last rule',
          'last rule, revised',
        ),
        'latin1',
      ),
    );
  });

  // The old folder is read-only (created as root in a container): it can be
  // moved aside but not emptied. Root itself can delete anything, so there
  // the write leaves nothing behind and there is nothing to report.
  it.skipIf(process.getuid?.() === 0)(
    'says so when the old folder of an updated skill could not be deleted',
    () => {
      const project = scratchProject(scratch());
      project.install('1.2.0');
      project.ship('retro', { 'SKILL.md': 'new\n' });
      chmodSync(project.local('retro'), 0o555);
      try {
        const report = project.install('1.3.0').find(({ name }) => name === 'retro');
        expect(report?.status).toBe('updated');
        expect(report?.reason).toBe(
          `the old folder could not be deleted; remove ${project.local('retro.toolbox-old')} by hand`,
        );
        expect(read(project.local('retro/SKILL.md'))).toBe('new\n');
      } finally {
        chmodSync(project.local('retro.toolbox-old'), 0o755);
      }
    },
  );

  it('reports a recorded skill the package no longer ships, and leaves it in place', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    rmSync(join(project.packageDir, 'skills', 'retro'), { recursive: true });

    const reports = project.install('1.3.0');

    expect(reports).toEqual([
      { name: 'code-review', status: 'unchanged', files: [] },
      { name: 'retro', status: 'retired', files: [] },
    ]);
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
    expect(project.records().retro.version).toBe('1.2.0');
  });

  it('drops the record of a retired skill once the project deleted its folder', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    rmSync(join(project.packageDir, 'skills', 'retro'), { recursive: true });
    rmSync(project.local('retro'), { recursive: true });

    expect(project.install('1.3.0')[1]).toEqual({ name: 'retro', status: 'removed', files: [] });
    expect(project.records()).not.toHaveProperty('retro');
    expect(statuses(project.install('1.3.0'))).toEqual({ 'code-review': 'unchanged' });
  });

  // Toolbox 1.3.0 added a skill; a teammate still runs 1.2.0, which does not
  // ship it. "Retired - delete it if unused" would be followed.
  it('does not call retired a skill a newer toolbox added', () => {
    const project = scratchProject(scratch());
    project.ship('brand-new', { 'SKILL.md': 'added in 1.3.0\n' });
    project.install('1.3.0');
    rmSync(join(project.packageDir, 'skills', 'brand-new'), { recursive: true });

    const reports = project.install('1.2.0');

    expect(statuses(reports)['brand-new']).toBe('ahead');
    expect(read(project.local('brand-new/SKILL.md'))).toBe('added in 1.3.0\n');
    expect(project.records()['brand-new'].version).toBe('1.3.0');
  });

  // A teammate who pulled the update but still has the old package installed.
  it('does not roll a skill back when an older toolbox runs over a newer record', () => {
    const project = scratchProject(scratch());
    project.ship('retro', { 'SKILL.md': 'new\n' });
    project.install('1.3.0');
    project.ship('retro', { 'SKILL.md': 'hello\n' });

    const reports = project.install('1.2.0');

    expect(statuses(reports).retro).toBe('ahead');
    expect(read(project.local('retro/SKILL.md'))).toBe('new\n');
    expect(project.records().retro.version).toBe('1.3.0');
  });
});

/** `retro` was reported copied and is a real folder with the shipped content, not a link. */
function expectACopyOfRetro(project: ScratchProject, reports: SkillInstallReport[]): void {
  expect(statuses(reports).retro).toBe('copied');
  expect(lstatSync(project.local('retro')).isSymbolicLink()).toBe(false);
  expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
}

describe('installSkills - what was already in .agents/skills', () => {
  it('replaces the link an earlier `toolbox install` wrote with a copy', () => {
    const project = scratchProject(scratch());
    linkAsV1(project, 'retro');

    const reports = project.install();

    expectACopyOfRetro(project, reports);
    // The package's own folder was the link's target: it must survive the swap.
    expect(read(join(project.packageDir, 'skills', 'retro', 'SKILL.md'))).toBe('hello\n');
  });

  // The manifest was committed and `.agents/skills/` was still git-ignored:
  // a teammate has the records and, on disk, the links of the 1.x install.
  it('replaces that link with a copy even when the manifest already has the skill', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    rmSync(project.local('retro'), { recursive: true });
    linkAsV1(project, 'retro');

    const reports = project.install('1.2.0');

    expectACopyOfRetro(project, reports);
    expect(project.records().retro.version).toBe('1.2.0');
  });

  // The copy fails (a file of the shipped skill cannot be read): the link
  // must still be there, or the next run reads the skill as deleted.
  it('keeps the link of a 1.x project when its copy cannot be made, and copies it once it can', () => {
    const project = scratchProject(scratch());
    linkAsV1(project, 'retro');
    project.ship('retro', { 'SKILL.md': 'hello\n', 'bad\\name.md': 'x' });

    expect(statuses(project.install()).retro).toBe('failed');
    expect(lstatSync(project.local('retro')).isSymbolicLink()).toBe(true);

    project.ship('retro', { 'SKILL.md': 'hello\n' });
    expectACopyOfRetro(project, project.install());
  });

  // The links are the selection of a 1.x project: only they become copies.
  it('copies the skills a 1.x project had linked, and only those', () => {
    const project = scratchProject(scratch());
    linkAsV1(project, 'retro');

    const reports = project.install();

    expect(statuses(reports)).toEqual({ 'code-review': 'available', retro: 'copied' });
  });

  it('replaces that link under a pnpm-style package dir, itself a link into the store', () => {
    const project = scratchProject(scratch());
    const store = join(project.projectRoot, 'node_modules', '.pnpm', 'toolbox@h1', 'toolbox');
    mkdirSync(join(store, '..'), { recursive: true });
    writeFiles(join(store, 'skills', 'retro'), { 'SKILL.md': 'hello\n' });
    rmSync(project.packageDir, { recursive: true });
    symlinkSync(store, project.packageDir, 'dir');
    linkAsV1(project, 'retro');

    project.install();

    expect(lstatSync(project.local('retro')).isSymbolicLink()).toBe(false);
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
  });

  it('replaces a dangling link', () => {
    const project = scratchProject(scratch());
    mkdirSync(project.local('.'), { recursive: true });
    symlinkSync('../../gone/retro', project.local('retro'), 'dir');
    expect(statuses(project.install()).retro).toBe('copied');
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
  });

  it("keeps the project's own link to somewhere else - a pin, not our link", () => {
    const project = scratchProject(scratch());
    writeFiles(join(project.projectRoot, 'my-skills', 'retro'), { 'SKILL.md': 'pinned' });
    mkdirSync(project.local('.'), { recursive: true });
    symlinkSync('../../my-skills/retro', project.local('retro'), 'dir');

    const reports = project.install();

    expect(statuses(reports).retro).toBe('pinned');
    expect(readlinkSync(project.local('retro'))).toBe('../../my-skills/retro');
    expect(project.records()).not.toHaveProperty('retro');
  });

  it("keeps the project's own folder with a shipped skill's name, and does not manage it", () => {
    const project = scratchProject(scratch());
    writeFiles(project.local('retro'), { 'SKILL.md': 'mine' });

    const reports = project.install();

    expect(statuses(reports).retro).toBe('unmanaged');
    expect(read(project.local('retro/SKILL.md'))).toBe('mine');
    expect(project.records()).not.toHaveProperty('retro');
  });

  it('adopts a folder that already equals the package, without rewriting it', () => {
    const project = scratchProject(scratch());
    writeFiles(project.local('retro'), { 'SKILL.md': 'hello\n' });
    utimesSync(project.local('retro/SKILL.md'), LONG_AGO, LONG_AGO);

    const reports = project.install('1.2.0');

    expect(statuses(reports).retro).toBe('adopted');
    expect(statSync(project.local('retro/SKILL.md')).mtime).toEqual(LONG_AGO);
    expect(project.records().retro).toEqual({ version: '1.2.0', hash: RETRO_HASH });
  });
});
