import { describe, expect, it } from 'vitest';

import { isOlderVersion } from './toolbox-version.mts';

describe('isOlderVersion', () => {
  it.each([
    ['1.2.0', '1.3.0', true],
    ['1.9.0', '1.10.0', true], // numeric, not lexical
    ['1.2.9', '2.0.0', true],
    ['2.0.0', '2.0.1', true],
    ['1.3.0', '1.3.0', false],
    ['2.0.0', '1.9.9', false],
    ['1.10.0', '1.9.0', false],
  ])('%s older than %s: %s', (version, than, expected) => {
    expect(isOlderVersion(version, than)).toBe(expected);
  });

  it('compares the release numbers of a pre-release', () => {
    expect(isOlderVersion('2.0.0-rc.1', '2.0.0')).toBe(false);
    expect(isOlderVersion('1.9.0-rc.1', '2.0.0')).toBe(true);
  });

  it('refuses what is not a version', () => {
    expect(() => isOlderVersion('latest', '1.0.0')).toThrow(
      'toolbox version: received "latest", expected "<major>.<minor>.<patch>"',
    );
  });
});
