import { describe, expect, it } from 'vitest';

import { isOlderVersion, parseReleaseNumber, ReleaseNumberError } from './toolbox-version.mts';

const v = (text: string): ReturnType<typeof parseReleaseNumber> => parseReleaseNumber(text);

describe('parseReleaseNumber', () => {
  it.each(['1.2.0', '10.0.1', '2.0.0-rc.1'])('takes %s', (text) => {
    expect(parseReleaseNumber(text)).toBe(text);
  });

  it.each([['latest'], [''], ['1.2'], ['v1.2.0'], [42], [undefined]])(
    'refuses %j, naming what it was reading',
    (value) => {
      expect(() => parseReleaseNumber(value, 'package.json "version"')).toThrow(
        new ReleaseNumberError(
          `package.json "version": received ${JSON.stringify(value)}, expected "<major>.<minor>.<patch>"`,
        ),
      );
    },
  );
});

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
    expect(isOlderVersion(v(version), v(than))).toBe(expected);
  });

  it('compares the release numbers of a pre-release', () => {
    expect(isOlderVersion(v('2.0.0-rc.1'), v('2.0.0'))).toBe(false);
    expect(isOlderVersion(v('1.9.0-rc.1'), v('2.0.0'))).toBe(true);
  });
});
