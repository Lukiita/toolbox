import { describe, expect, it } from 'vitest';

import type { SkillInspection } from '../application/inspect-skills.mts';
import type { InstallStatus } from '../application/install-skills.mts';
import { inspectionLines, installLine } from './skill-report-lines.mts';

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
      "conflict:        .agents/skills/ddd-tactical [SKILL.md] - the new version conflicts with the project's edits; nothing was written (`toolbox install --write-conflicts` writes the conflict markers)",
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
      'base-lost',
      'ahead',
      'pinned',
      'retired',
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
    baseLost: false,
    paths: { local: '/p/l', base: '/p/b', shipped: '/p/s' },
    ...overrides,
  };
}

describe('inspectionLines', () => {
  it('is one line for an intact, current skill', () => {
    expect(inspectionLines(inspection({}))).toEqual(['intact            ddd-tactical (1.2.0)']);
  });

  it('names both sides of a skill that is altered and behind, with the files of each', () => {
    const lines = inspectionLines(
      inspection({
        local: 'altered',
        upstream: 'behind',
        alteredFiles: ['SKILL.md', 'references/java.md'],
        behindFiles: ['references/aggregate.md'],
      }),
    );
    expect(lines).toEqual([
      'altered, behind   ddd-tactical (1.2.0)',
      '    edited by the project: SKILL.md, references/java.md',
      '    changed in the toolbox: references/aggregate.md',
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

  it('warns about a stored original that is gone or edited', () => {
    expect(inspectionLines(inspection({ local: 'altered', baseLost: true }))).toEqual([
      'altered           ddd-tactical (1.2.0)',
      '    original missing or edited: restore .agents/toolbox/base/ddd-tactical from git',
    ]);
  });
});
