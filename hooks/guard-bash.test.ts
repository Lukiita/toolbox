import { describe, expect, it } from 'vitest';

import { FORCE_PUSH_RULE, pushRules, SECRET_RULE } from './guard-bash.mjs';

const denies = (rules: { pattern: RegExp }[], command: string): boolean =>
  rules.some((r) => r.pattern.test(command));

describe('pushRules', () => {
  it('denies a push to a protected branch and allows the others', () => {
    const rules = pushRules(['main', 'release-1.0']);
    expect(denies(rules, 'git push origin main')).toBe(true);
    expect(denies(rules, 'git push origin release-1.0')).toBe(true);
    expect(denies(rules, 'git push origin feat/x')).toBe(false);
  });

  it('an empty protected list protects nothing - it must not match every push', () => {
    expect(denies(pushRules([]), 'git push origin my-feature')).toBe(false);
  });

  it('escapes regex characters in a branch name', () => {
    expect(denies(pushRules(['v1.0']), 'git push origin v1x0')).toBe(false);
    expect(denies(pushRules(['v1.0']), 'git push origin v1.0')).toBe(true);
  });

  it('the force-push rule is always present', () => {
    expect(pushRules([])).toContain(FORCE_PUSH_RULE);
  });
});

describe('the universal rules', () => {
  it('deny reading a live env file but not the example', () => {
    expect(SECRET_RULE.pattern.test('cat .env')).toBe(true);
    expect(SECRET_RULE.pattern.test('cat .env.example')).toBe(false);
  });

  it('deny a force push without lease', () => {
    expect(FORCE_PUSH_RULE.pattern.test('git push --force origin x')).toBe(true);
    expect(FORCE_PUSH_RULE.pattern.test('git push --force-with-lease origin x')).toBe(false);
  });
});
