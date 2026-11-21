import { describe, expect, it } from 'vitest';

import { classifySkill } from './skill-state.mts';
import { treeOf } from './skill-tree.fixtures.ts';

const V1 = treeOf({ 'SKILL.md': 'v1' });
const V2 = treeOf({ 'SKILL.md': 'v2' });
const EDITED = treeOf({ 'SKILL.md': 'v1 edited by the project' });
const AT_V1 = { version: '1.2.0', hash: V1.hash };

describe('classifySkill - a skill the manifest does not know', () => {
  it('is not installed when the project has no folder for it', () => {
    expect(classifySkill({ record: undefined, local: undefined, shipped: V1 }, '1.2.0')).toEqual({
      local: 'not-installed',
      upstream: 'untracked',
    });
  });

  it("is unmanaged when the project has its own folder under the skill's name", () => {
    expect(classifySkill({ record: undefined, local: EDITED, shipped: V1 }, '1.2.0')).toEqual({
      local: 'unmanaged',
      upstream: 'untracked',
    });
  });
});

describe('classifySkill - a recorded skill', () => {
  it.each([
    ['intact and current', V1, V1, 'intact', 'current'],
    ['altered and current', EDITED, V1, 'altered', 'current'],
    ['intact and behind', V1, V2, 'intact', 'behind'],
    ['altered and behind', EDITED, V2, 'altered', 'behind'],
  ] as const)('is %s', (_, local, shipped, expectedLocal, expectedUpstream) => {
    expect(classifySkill({ record: AT_V1, local, shipped }, '1.3.0')).toEqual({
      local: expectedLocal,
      upstream: expectedUpstream,
    });
  });

  it('is removed when the project deleted its folder', () => {
    expect(classifySkill({ record: AT_V1, local: undefined, shipped: V2 }, '1.3.0')).toEqual({
      local: 'removed',
      upstream: 'behind',
    });
  });

  // The new version applied by hand, or an install that died before saving
  // the manifest: the record is stale, the skill is not. There is nothing to
  // merge and nothing waiting.
  it('is intact and current when the project already holds what the package ships', () => {
    expect(classifySkill({ record: AT_V1, local: V2, shipped: V2 }, '1.3.0')).toEqual({
      local: 'intact',
      upstream: 'current',
    });
  });

  it('is retired when the package no longer ships it', () => {
    expect(classifySkill({ record: AT_V1, local: EDITED, shipped: undefined }, '1.3.0')).toEqual({
      local: 'altered',
      upstream: 'retired',
    });
  });

  // A teammate with a stale node_modules: what their package ships is older
  // than the record, not newer.
  it('is ahead, not behind, when the record was written by a newer toolbox', () => {
    const record = { version: '1.4.0', hash: V2.hash };
    expect(classifySkill({ record, local: V2, shipped: V1 }, '1.3.0')).toEqual({
      local: 'intact',
      upstream: 'ahead',
    });
  });
});
