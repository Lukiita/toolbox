import { describe, expect, it } from 'vitest';

import type { SkillInspection } from '../application/inspect-skills.mts';
import type { InstallStatus } from '../application/install-skills.mts';
import { availableLine, inspectionLines, installLine } from './skill-report-lines.mts';

describe('installLine', () => {
  it('names the status and the folder for a skill that needs no explanation', () => {
    expect(installLine({ name: 'retro', status: 'copied', files: [] })).toBe(
      'copied:          .agents/skills/retro',
    );
    expect(installLine({ name: 'retro', status: 'unchanged', files: [] })).toBe(
      'unchanged:       .agents/skills/retro',
    );
  });

  it('says why an edited skill was left alone', () => {
    expect(installLine({ name: 'ddd-tactical', status: 'altered', files: [] })).toBe(
      'altered:         .agents/skills/ddd-tactical - edited by the project; kept',
    );
  });

  it('names the files a merge settled', () => {
    expect(
      installLine({ name: 'ddd-tactical', status: 'merged', files: ['SKILL.md', 'a.md'] }),
    ).toBe(
      "merged:          .agents/skills/ddd-tactical [SKILL.md, a.md] - the new version was merged into the project's edits",
    );
  });

  it('names the conflicting files and the way out', () => {
    expect(installLine({ name: 'ddd-tactical', status: 'conflict', files: ['SKILL.md'] })).toBe(
      "conflict:        .agents/skills/ddd-tactical [SKILL.md] - the new version conflicts with the project's edits; nothing was written (`toolbox install --write-conflicts` writes the merge for you to settle)",
    );
  });

  it('adds the reason a merge could not be tried', () => {
    expect(
      installLine({
        name: 'ddd-tactical',
        status: 'no-original',
        files: [],
        reason: 'could not fetch v1.2.0 from https://example.com/t.git: no route to host',
      }),
    ).toBe(
      'no-original:     .agents/skills/ddd-tactical - edited by the project; the new version was not merged and nothing was written, because the original could not be read: could not fetch v1.2.0 from https://example.com/t.git: no route to host',
    );
  });

  // Edit against delete, add against add, binary: nothing to mark there.
  it('does not promise markers in every file of a merge written with conflicts', () => {
    expect(
      installLine({
        name: 'ddd-tactical',
        status: 'conflict-marked',
        files: ['SKILL.md', 'x.bin'],
      }),
    ).toBe(
      "conflict-marked: .agents/skills/ddd-tactical [SKILL.md, x.bin] - written for you to settle: conflict markers where the text can carry them, the project's side kept elsewhere; check every file listed",
    );
  });

  it('says which skill brought another one along', () => {
    expect(
      installLine({
        name: 'sql-quality',
        status: 'copied',
        files: [],
        reason: 'needed by code-review',
      }),
    ).toBe('copied:          .agents/skills/sql-quality - needed by code-review');
  });

  it('says what went wrong with a skill that failed', () => {
    expect(
      installLine({
        name: 'retro',
        status: 'failed',
        files: [],
        reason: 'EACCES: permission denied',
      }),
    ).toBe(
      'failed:          .agents/skills/retro - could not be settled; the other skills were: EACCES: permission denied',
    );
  });

  it('has a line for every status', () => {
    const statuses: InstallStatus[] = [
      'copied',
      'adopted',
      'updated',
      'merged',
      'conflict-marked',
      'unchanged',
      'altered',
      'unmanaged',
      'removed',
      'conflict',
      'no-original',
      'ahead',
      'pinned',
      'retired',
      'available',
      'failed',
    ];
    for (const status of statuses) {
      expect(installLine({ name: 'x', status, files: [] })).toMatch(
        new RegExp(`^${status}: +\\.agents/skills/x( - .+)?$`),
      );
    }
  });
});

function inspection(overrides: Partial<SkillInspection>): SkillInspection {
  return {
    name: 'ddd-tactical',
    version: '1.2.0',
    local: 'intact',
    upstream: 'current',
    alteredFiles: [],
    behindFiles: [],
    divergedFiles: [],
    paths: { local: '/p/l', shipped: '/p/s' },
    ...overrides,
  };
}

describe('inspectionLines', () => {
  it('is one line for an intact, current skill', () => {
    expect(inspectionLines(inspection({}))).toEqual(['intact            ddd-tactical (1.2.0)']);
  });

  it('names the files the project edited, and the files a waiting version changes', () => {
    expect(
      inspectionLines(
        inspection({ local: 'altered', alteredFiles: ['SKILL.md', 'references/java.md'] }),
      ),
    ).toEqual([
      'altered           ddd-tactical (1.2.0)',
      '    edited by the project: SKILL.md, references/java.md',
    ]);
    expect(
      inspectionLines(inspection({ upstream: 'behind', behindFiles: ['references/aggregate.md'] })),
    ).toEqual([
      'intact, behind    ddd-tactical (1.2.0)',
      '    changed in the toolbox: references/aggregate.md',
    ]);
  });

  it('does not say whose change it is when both sides moved', () => {
    const lines = inspectionLines(
      inspection({ local: 'altered', upstream: 'behind', divergedFiles: ['SKILL.md'] }),
    );
    expect(lines).toEqual([
      'altered, behind   ddd-tactical (1.2.0)',
      '    differs from the toolbox (edits and new version together): SKILL.md',
    ]);
  });

  it('says so when a skill is retired or ahead', () => {
    expect(inspectionLines(inspection({ upstream: 'retired' }))).toEqual([
      'intact, retired   ddd-tactical (1.2.0)',
    ]);
    expect(inspectionLines(inspection({ upstream: 'ahead' }))).toEqual([
      'intact, ahead     ddd-tactical (1.2.0)',
    ]);
  });

  it('shows no version and no upstream side for a skill the manifest does not know', () => {
    expect(
      inspectionLines(
        inspection({ version: undefined, local: 'unmanaged', upstream: 'untracked' }),
      ),
    ).toEqual(['unmanaged         ddd-tactical']);
  });
});

describe('availableLine', () => {
  it('names every skill the project did not pick in one line', () => {
    expect(availableLine(['retro', 'sql-quality'])).toBe(
      'available:       retro, sql-quality - shipped by the toolbox, not installed here; `toolbox install <name>` adds it',
    );
  });
});
