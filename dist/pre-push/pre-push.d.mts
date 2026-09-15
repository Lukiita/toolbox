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
export declare const EMPTY_SHA = "0000000000000000000000000000000000000000";
/**
 * Parses git's stdin. A push that changes no code would measure the same
 * number as before - a documentation push does not pay for the gate.
 */
export declare function parsePushedRefs(stdin: string): PushedRef[];
export declare function pushesCode(refs: readonly PushedRef[], ports: PrePushPorts): boolean;
/**
 * The whole hook, as a value.
 *
 * @example
 *   const { exitCode, lines } = decidePrePush(parsePushedRefs(stdin), 'HEAD', 'main', ports);
 */
export declare function decidePrePush(refs: readonly PushedRef[], head: string, baseBranch: string, ports: PrePushPorts): PrePushDecision;
