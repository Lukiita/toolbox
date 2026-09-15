import { describe, expect, it } from 'vitest';

import {
  decidePrePush,
  EMPTY_SHA,
  type GateOutcome,
  parsePushedRefs,
  type PrePushPorts,
} from './pre-push.mts';

const TIP = 'aaaa';
const FORK = 'ffff';
const HEAD = 'hhhh';

const pass: GateOutcome = { passed: true, failures: [], reportPath: '/r.md' };
const fail: GateOutcome = {
  passed: false,
  failures: [
    { metric: 'coverage-percent', limit: 10, current: 9, message: 'coverage went from 10 to 9' },
  ],
  reportPath: '/r.md',
};

/** Ports with a recording gate; every field overridable per scenario. */
function ports(
  overrides: Partial<PrePushPorts> & { calls?: (string | undefined)[] } = {},
): PrePushPorts & {
  calls: (string | undefined)[];
} {
  const calls: (string | undefined)[] = overrides.calls ?? [];
  const { gate = () => pass, ...rest } = overrides;
  return {
    baseTip: () => TIP,
    mergeBase: () => FORK,
    hasCommit: () => true,
    touchesCode: () => true,
    baselineChanged: () => false,
    ...rest,
    // Records every gate call, then delegates to the scenario's gate.
    gate: (from) => {
      calls.push(from);
      return gate(from);
    },
    calls,
  };
}

const newBranch = [{ localSha: HEAD, remoteSha: EMPTY_SHA }];

describe('parsePushedRefs', () => {
  it("reads git's four-column stdin and ignores blank lines", () => {
    const refs = parsePushedRefs(`refs/heads/x ${HEAD} refs/heads/x ${EMPTY_SHA}\n\n`);
    expect(refs).toEqual([{ localSha: HEAD, remoteSha: EMPTY_SHA }]);
  });
});

describe('decidePrePush', () => {
  it('1. a docs-only push runs no gate', () => {
    const p = ports({ touchesCode: () => false });
    expect(decidePrePush(newBranch, HEAD, 'main', p)).toEqual({ exitCode: 0, lines: [] });
    expect(p.calls).toEqual([]);
  });

  it('2. a code push that passes against the base tip exits 0 after one gate call', () => {
    const p = ports();
    const d = decidePrePush(newBranch, HEAD, 'main', p);
    expect(d.exitCode).toBe(0);
    expect(p.calls).toEqual([TIP]);
  });

  it('3. a regression with the baseline untouched blocks, with the rebase advice', () => {
    const p = ports({ gate: () => fail });
    const d = decidePrePush(newBranch, HEAD, 'main', p);
    expect(d.exitCode).toBe(1);
    expect(d.lines.join('\n')).toContain('coverage went from 10 to 9');
    expect(d.lines.join('\n')).toContain('Rebase onto the base');
  });

  it('4. a regression whose re-freeze the branch recorded, and the code no worse than the freeze, passes with the RED warning', () => {
    const p = ports({ baselineChanged: () => true, gate: (from) => (from ? fail : pass) });
    const d = decidePrePush(newBranch, HEAD, 'main', p);
    expect(d.exitCode).toBe(0);
    expect(d.lines.join('\n')).toContain('will be RED');
  });

  it('5. re-frozen but the code is worse than the freeze: blocks', () => {
    const p = ports({ baselineChanged: () => true, gate: () => fail });
    const d = decidePrePush(newBranch, HEAD, 'main', p);
    expect(d.exitCode).toBe(1);
    expect(d.lines.join('\n')).toContain('got worse than what was frozen');
  });

  it('6. without origin/<base> it falls back to the own baseline and says so', () => {
    const p = ports({ baseTip: () => undefined, gate: () => fail });
    const d = decidePrePush(newBranch, HEAD, 'main', p);
    expect(d.exitCode).toBe(1);
    expect(d.lines[0]).toContain('origin/main not found');
    expect(p.calls).toEqual([undefined]);
  });

  it('7. a branch deletion runs no gate', () => {
    const p = ports();
    const d = decidePrePush([{ localSha: EMPTY_SHA, remoteSha: TIP }], HEAD, 'main', p);
    expect(d).toEqual({ exitCode: 0, lines: [] });
    expect(p.calls).toEqual([]);
  });

  it('8. an unresolvable remote sha fails closed: the gate runs', () => {
    const p = ports({ hasCommit: (sha) => sha !== 'deadbeef', touchesCode: () => false });
    decidePrePush([{ localSha: HEAD, remoteSha: 'deadbeef' }], HEAD, 'main', p);
    expect(p.calls).toEqual([TIP]);
  });

  it('9. the base re-froze after the fork and the branch did not: blocks with rebase advice, measured against the NEW tip', () => {
    // baselineChanged is asked from the FORK, not the tip - so the base's own
    // re-freeze does not read as the branch's decision.
    const asked: string[][] = [];
    const p = ports({
      gate: () => fail,
      baselineChanged: (from, to) => {
        asked.push([from, to]);
        return false;
      },
    });
    const d = decidePrePush(newBranch, HEAD, 'main', p);
    expect(d.exitCode).toBe(1);
    expect(asked).toEqual([[FORK, HEAD]]);
    expect(p.calls).toEqual([TIP]);
  });
});
