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

import { scratchProject, SKILL_V1, statuses, writeFiles } from './install.fixtures.ts';

const scratch = scratchDirs('toolbox-install-');

const read = (path: string): string => readFileSync(path, 'utf8');
// sha256sum of "SKILL.md\0<sha256 of 'hello\n'>\n" - see skill-tree.test.ts.
const RETRO_HASH = 'sha256:c9a89a84ba57e7d9f7da6fce928f625d9d5705f00cfdb8aa6117dbd8d6d9122a';
const LONG_AGO = new Date('2020-01-01T00:00:00Z');

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

  it('does not bring back a skill the project deleted', () => {
    const project = scratchProject(scratch());
    project.install();
    rmSync(project.local('retro'), { recursive: true });

    const reports = project.install();

    expect(statuses(reports).retro).toBe('removed');
    expect(existsSync(project.local('retro'))).toBe(false);
  });
});

describe('installSkills - a run that does not finish', () => {
  // A write killed between swapping the old folder out and the new one in.
  it('does not read a folder a dead run left swapped out as deleted by the project', () => {
    const project = scratchProject(scratch());
    project.install();
    renameSync(project.local('retro'), project.local('retro.toolbox-old'));

    const reports = project.install();

    expect(statuses(reports).retro).toBe('unchanged');
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
    expect(existsSync(project.local('retro.toolbox-old'))).toBe(false);
  });

  // `retro` cannot be read (a file name no tree accepts), after `code-review`
  // was already replaced on disk.
  it('keeps the records and the reports of the skills settled before a later one failed', () => {
    const project = scratchProject(scratch());
    project.install('1.2.0');
    project.ship('code-review', { 'SKILL.md': REVISED });
    project.ship('retro', { 'SKILL.md': 'hello\n', 'bad\\name.md': 'x' });
    project.reported.length = 0;

    expect(() => project.install('1.3.0')).toThrow(/skill file path/);

    expect(read(project.local('code-review/SKILL.md'))).toBe(REVISED);
    expect(project.records()['code-review'].version).toBe('1.3.0');
    expect(project.records().retro.version).toBe('1.2.0');
    expect(project.reported).toEqual([{ name: 'code-review', status: 'updated', files: [] }]);
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

    const reports = project.install('1.3.0', true);

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
    expect(() => project.install('1.2.0')).toThrow(/toolbox-skills\.json/);
    expect(project.releases.disposals).toBe(2);
  });

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

describe('installSkills - what was already in .agents/skills', () => {
  it('replaces the link an earlier `toolbox install` wrote with a copy', () => {
    const project = scratchProject(scratch());
    mkdirSync(project.local('.'), { recursive: true });
    symlinkSync('../../node_modules/@lukiita/toolbox/skills/retro', project.local('retro'), 'dir');

    const reports = project.install();

    expect(statuses(reports).retro).toBe('copied');
    expect(lstatSync(project.local('retro')).isSymbolicLink()).toBe(false);
    expect(read(project.local('retro/SKILL.md'))).toBe('hello\n');
    // The package's own folder was the link's target: it must survive the swap.
    expect(read(join(project.packageDir, 'skills', 'retro', 'SKILL.md'))).toBe('hello\n');
  });

  it('replaces that link under a pnpm-style package dir, itself a link into the store', () => {
    const project = scratchProject(scratch());
    const store = join(project.projectRoot, 'node_modules', '.pnpm', 'toolbox@h1', 'toolbox');
    mkdirSync(join(store, '..'), { recursive: true });
    writeFiles(join(store, 'skills', 'retro'), { 'SKILL.md': 'hello\n' });
    rmSync(project.packageDir, { recursive: true });
    symlinkSync(store, project.packageDir, 'dir');
    mkdirSync(project.local('.'), { recursive: true });
    symlinkSync('../../node_modules/@lukiita/toolbox/skills/retro', project.local('retro'), 'dir');

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
