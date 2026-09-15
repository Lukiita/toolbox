// The ratchet before the push instead of after CI - as a decision function.
//
// Why pre-push and not pre-commit: the ratchet measures the WHOLE repository,
// not the diff. Charging it on every commit would fail on files nobody
// touched. Once per push is the right grain: it is the same measurement CI
// will make minutes later, and slow feedback inverts the incentive - with the
// job red and the code already published, re-freezing is the cheap path.
//
// Why the base TIP and not the local json: CI compares against the PR's base
// (`ci.example.yml` passes the base sha). A hook reading the branch's own
// baseline goes green after a re-freeze while CI stays red - green local, red
// remote, worse than no gate (project-d, 2026-09-11). The merge-base would
// also diverge: when the base re-froze after the fork, it passes on the old
// number while CI fails on the new one (review of PR #4).
//
// What the hook charges is the DECISION, not the number: a worsening whose
// re-freeze THIS branch recorded (diffed from the merge-base, so a re-freeze
// on the base is not mistaken for yours) passes with a warning, as long as
// the code is no worse than what was frozen; an unrecorded one blocks.
//
// Pure: every git and gate call is injected, so the nine paths below have a
// test each. `runPrePush` in the CLI wires the real ones.

import type { Failure } from '../quality-gate/compare.mts';

/** One line of git's pre-push stdin: `<local ref> <local sha> <remote ref> <remote sha>`. */
export interface PushedRef {
  localSha: string;
  remoteSha: string;
}

export interface GateOutcome {
  passed: boolean;
  failures: Failure[];
  /** Where the full report was written, for the "see more" line. */
  reportPath: string;
}

/** What the decision needs from the world; every call may fail -> undefined. */
export interface PrePushPorts {
  /** Sha of `origin/<base>`'s tip, or undefined when not fetched. */
  baseTip: () => string | undefined;
  /** Merge-base of two shas, or undefined when unrelated. */
  mergeBase: (a: string, b: string) => string | undefined;
  /** Whether git can resolve the sha locally. */
  hasCommit: (sha: string) => boolean;
  /** Whether a diff between two shas touches code. */
  touchesCode: (from: string, to: string) => boolean;
  /** Whether `quality-baseline.json` differs between two shas. */
  baselineChanged: (from: string, to: string) => boolean;
  /** The gate against a rev's baseline (`baselineFrom`) or the branch's own. */
  gate: (baselineFrom: string | undefined) => GateOutcome;
}

export interface PrePushDecision {
  exitCode: 0 | 1;
  lines: string[];
}

export const EMPTY_SHA = '0000000000000000000000000000000000000000';

/**
 * Parses git's stdin. A push that changes no code would measure the same
 * number as before - a documentation push does not pay for the gate.
 *
 * @example
 *   parsePushedRefs('refs/heads/x abc refs/heads/x 000…0\n') // => [{ localSha: 'abc', remoteSha: '000…0' }]
 */
export function parsePushedRefs(stdin: string): PushedRef[] {
  return stdin
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 4)
    .map(([, localSha, , remoteSha]) => ({ localSha, remoteSha }));
}

function refTouchesCode(ref: PushedRef, ports: PrePushPorts, baseTip: string | undefined): boolean {
  if (ref.localSha === EMPTY_SHA) return false; // branch deletion
  const before =
    ref.remoteSha === EMPTY_SHA
      ? baseTip && ports.mergeBase(baseTip, ref.localSha) // new branch: no "before", use the base
      : ref.remoteSha;
  if (!before) return true; // no known base: measure, do not guess
  // A sha git cannot resolve (force-push over unfetched commits, pruned
  // remote) would make the diff error out and read as "no code". Fail closed.
  if (!ports.hasCommit(before) || !ports.hasCommit(ref.localSha)) return true;
  return ports.touchesCode(before, ref.localSha);
}

/**
 * Whether any pushed ref changes code - the gate runs only then.
 *
 * @example
 *   pushesCode(parsePushedRefs(stdin), ports) // => false for a docs-only push
 */
export function pushesCode(refs: readonly PushedRef[], ports: PrePushPorts): boolean {
  const baseTip = ports.baseTip();
  return refs.some((ref) => refTouchesCode(ref, ports, baseTip));
}

function regressionLines(outcome: GateOutcome): string[] {
  return [
    ...outcome.failures.map((f) => `- ${f.message}`),
    '',
    `Full report: ${outcome.reportPath}`,
  ];
}

const REBASE_ADVICE = [
  '────────────────────────────────────────────────────────────────────────────',
  'The quality gate failed. CI will fail the same way - cheaper to fix here.',
  '',
  'Before re-freezing, check WHOSE worsening it is: quality-baseline.json travels',
  'in the commit, and if the base re-froze after your branch left, you are',
  'measuring against a stale number. Rebase onto the base and measure again.',
  '',
  'If the worsening is yours, fix the code. `--update-baseline` is a deliberate',
  'act, with the reason in the commit body, in a PR of its own: the ratchet only',
  'exists while re-freezing is more expensive than fixing.',
  '────────────────────────────────────────────────────────────────────────────',
];

const RECORDED_DECISION = [
  '────────────────────────────────────────────────────────────────────────────',
  'Regression against the base, but quality-baseline.json was re-frozen on this',
  'branch - a recorded decision. Push allowed.',
  '',
  'The quality job on this PR will be RED: it compares against the base, and',
  'the base holds the old number. That is expected on a PR whose job is the',
  're-freeze. If this is a feature PR, split the re-freeze into its own PR on',
  'the base, merge it, and rebase this one.',
  '────────────────────────────────────────────────────────────────────────────',
];

function withoutBase(baseBranch: string, ports: PrePushPorts): PrePushDecision {
  const lines = [
    `quality gate: origin/${baseBranch} not found - comparing against the branch's own baseline.`,
    '(fetch it to measure against the same point CI does)',
  ];
  const own = ports.gate(undefined);
  if (own.passed) return { exitCode: 0, lines };
  return { exitCode: 1, lines: [...lines, ...regressionLines(own)] };
}

function recordedDecision(ports: PrePushPorts, lines: string[]): PrePushDecision {
  // Charge that the re-freeze covers the worsening: against the branch's own
  // baseline the gate must pass, or the code got worse than what was frozen.
  const own = ports.gate(undefined);
  if (own.passed) return { exitCode: 0, lines: [...lines, ...RECORDED_DECISION] };
  return {
    exitCode: 1,
    lines: [
      ...lines,
      '',
      'quality-baseline.json was re-frozen on this branch, but the code got worse than what was frozen:',
      ...regressionLines(own),
    ],
  };
}

/**
 * The whole hook, as a value.
 *
 * @example
 *   const { exitCode, lines } = decidePrePush(parsePushedRefs(stdin), 'HEAD', 'main', ports);
 */
export function decidePrePush(
  refs: readonly PushedRef[],
  head: string,
  baseBranch: string,
  ports: PrePushPorts,
): PrePushDecision {
  if (!pushesCode(refs, ports)) return { exitCode: 0, lines: [] };

  // Two revisions with two jobs: the TIP is what the gate measures against
  // (the same point CI uses); the MERGE-BASE is where "did this branch
  // re-freeze" starts.
  const baseSha = ports.baseTip();
  const forkSha = baseSha && ports.mergeBase(baseSha, head);
  if (!baseSha || !forkSha) return withoutBase(baseBranch, ports);

  const lines = [`Quality gate against origin/${baseBranch}...`];
  const againstBase = ports.gate(baseSha);
  if (againstBase.passed) return { exitCode: 0, lines };

  lines.push(...regressionLines(againstBase));
  if (ports.baselineChanged(forkSha, head)) return recordedDecision(ports, lines);
  return { exitCode: 1, lines: [...lines, ...REBASE_ADVICE] };
}
