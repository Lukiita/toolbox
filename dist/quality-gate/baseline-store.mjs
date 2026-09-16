// The baseline on disk and in git: read, reconcile, re-freeze.
//
// Everything that touches `quality-baseline.json` lives here, so the gate
// orchestration reads like the README and the file format has one owner.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { effectiveBaseline } from "./compare.mjs";
import { runGit } from "./git.mjs";
export const BASELINE_FILE = 'quality-baseline.json';
// Metadata for each metric, so `--update-baseline` can CREATE an entry that
// does not exist in the json yet. Without this, the compare failure message
// ("run with --update-baseline to freeze it") was a false promise: the update
// only touched entries already present, and adopting a new metric meant
// editing the baseline by hand. Existing entries keep owning their own
// metadata - the defaults apply only at birth.
export const METRIC_DEFAULTS = {
    'coverage-percent': {
        section: 'Coverage',
        label: 'Line coverage',
        mode: 'baseline',
        direction: 'higher-is-better',
        unit: '%',
    },
    'uncovered-lines': {
        section: 'Coverage',
        label: 'Uncovered lines',
        mode: 'baseline',
        direction: 'lower-is-better',
        gate: false,
    },
    'files-with-uncovered-lines': {
        section: 'Coverage',
        label: 'Files with uncovered lines',
        mode: 'baseline',
        direction: 'lower-is-better',
        gate: false,
    },
    'duplication-percent': {
        section: 'Duplication',
        label: 'Duplicated lines',
        mode: 'baseline',
        direction: 'lower-is-better',
        unit: '%',
    },
    'duplication-fragments': {
        section: 'Duplication',
        label: 'Duplicated fragments',
        mode: 'baseline',
        direction: 'lower-is-better',
    },
    'pure-rule-outside-domain': {
        section: 'Architecture',
        label: 'Pure rules outside the domain',
        mode: 'baseline',
        direction: 'lower-is-better',
    },
    'circular-dependencies': {
        section: 'Architecture',
        label: 'Circular dependencies',
        mode: 'baseline',
        direction: 'lower-is-better',
        note: 'Strongly connected components in the production import graph (cycles.mts). A cycle means no file in it can be reused or understood alone - the on-ramp to the Big Ball of Mud.',
    },
    'files-over-limit': {
        section: 'Size',
        label: 'Files over the line limit',
        mode: 'baseline',
        direction: 'lower-is-better',
    },
    'cc-over-limit': {
        section: 'Complexity',
        label: 'Functions over the CC limit',
        mode: 'baseline',
        direction: 'lower-is-better',
        note: 'Functions with cyclomatic complexity above quality.ccLimit (complexity.mts). Generative AI solves by brute force and accumulates accidental complexity; the ratchet freezes the debt and only lets it shrink.',
    },
    'explicit-any': {
        section: 'Types',
        label: 'Explicit `any`',
        mode: 'baseline',
        direction: 'lower-is-better',
        note: 'AST count of any-keyword nodes in production files (any-count.mts). AGENTS.md bans new `any`; the ratchet lets legacy debt only shrink.',
    },
};
// Current name -> the name the metric had before the ratchet came from the
// toolbox (the Portuguese keys of pre-toolbox installs, see README
// "Migrating a pre-toolbox baseline"). Used only when comparing against a base
// older than the key migration; once main carries the new keys the map is
// inert (no key is missing) and can go. Until then it is what keeps the
// ratchet from going blind exactly on the PR that renames.
export const LEGACY_METRIC_KEYS = {
    'coverage-percent': 'cobertura-percentual',
    'uncovered-lines': 'linhas-descobertas',
    'files-with-uncovered-lines': 'arquivos-com-linha-descoberta',
    'duplication-percent': 'duplicacao-percentual',
    'duplication-fragments': 'duplicacao-fragmentos',
    'pure-rule-outside-domain': 'regra-pura-fora-da-lib',
    'files-over-limit': 'arquivos-acima-do-limite',
};
/**
 * The branch's own baseline, from the worktree.
 *
 * @example
 *   readOwnBaseline(root).metrics['coverage-percent'].value
 */
export function readOwnBaseline(root) {
    const path = resolve(root, BASELINE_FILE);
    if (!existsSync(path)) {
        throw new Error(`${BASELINE_FILE} not found at ${root}: copy templates/quality-gate/baseline.example.json there and run \`toolbox quality --update-baseline\``);
    }
    return parseBaseline(readFileSync(path, 'utf8'), path);
}
function parseBaseline(json, where) {
    try {
        return JSON.parse(json);
    }
    catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        throw new Error(`${where} is not valid JSON (${reason}); expected the baseline shape of templates/quality-gate/baseline.example.json`);
    }
}
/**
 * The baseline as it is at `rev`, or undefined when that commit has none.
 * Only the missing file is "none": a malformed file at the base must fail,
 * or the gate would fall back to the branch's own baseline and a PR that
 * re-froze itself would pass (review, loop round 1).
 */
function readBaselineAt(root, rev) {
    // The rev must exist: a typo (`--baseline-from mian`) must not read as "the
    // base has no baseline" and compare the branch with itself (loop round 2).
    try {
        runGit(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
    }
    catch {
        throw new Error(`--baseline-from ${rev}: not a commit in this repository (fetch it, or check the spelling)`);
    }
    let json;
    try {
        json = runGit(root, ['show', `${rev}:${BASELINE_FILE}`]);
    }
    catch {
        return undefined;
    }
    return parseBaseline(json, `${rev}:${BASELINE_FILE}`);
}
/**
 * The baseline to compare against: the branch's own, or the one at `rev`
 * (CI passes the PR's base) resolved with the branch's by `effectiveBaseline`
 * - a renamed key keeps comparing under the old name, a metric the base never
 * had keeps the local floor and is reported as self-compared, and what a
 * metric means comes from METRIC_DEFAULTS, never from either file. A rev with
 * no baseline yet (the PR that introduces the ratchet) falls back to the
 * branch's own, and says so through `warn` so nobody reads "passed" believing
 * the base was compared.
 */
export function readComparisonBaseline(root, rev, warn) {
    if (!rev)
        return { base: readOwnBaseline(root), fromLocalFloor: [] };
    // Only "the rev has no baseline" is caught: a missing OWN baseline must
    // surface as itself, not as a warning about the wrong file (found in review).
    const fromRev = readBaselineAt(root, rev);
    if (!fromRev) {
        warn(`warning: ${rev} has no ${BASELINE_FILE} (the PR that introduces the ratchet).\n` +
            "Comparing against the branch's own baseline.");
        return { base: readOwnBaseline(root), fromLocalFloor: [] };
    }
    const { baseline, fromLocalFloor } = effectiveBaseline(fromRev, readOwnBaseline(root), LEGACY_METRIC_KEYS, METRIC_DEFAULTS);
    if (fromLocalFloor.length > 0) {
        warn(`warning: ${rev} has no baseline for ${fromLocalFloor.length} metric(s): ${fromLocalFloor.join(', ')}.\n` +
            "Those were compared against this branch's own frozen numbers.");
    }
    return { base: baseline, origin: rev, fromLocalFloor };
}
/**
 * Whether the branch touched the baseline since `origin` - what the report warns about.
 *
 * @example
 *   baselineChangedSince(root, 'origin/main') // => true when the PR re-froze
 */
export function baselineChangedSince(root, origin) {
    // `A...B` fatals without a merge base (shallow clone, unrelated rev); this
    // only feeds a warning in the report, so unknown reads as "no".
    try {
        return runGit(root, ['diff', '--name-only', `${origin}...HEAD`]).includes(BASELINE_FILE);
    }
    catch {
        return false;
    }
}
/**
 * Rebuilds the baseline from what was measured: an existing entry keeps its
 * metadata, a new one is born from the registered defaults, and a metric no
 * longer measured is pruned - stale entries would document a gate that no
 * longer exists. Re-freezing is already the deliberate, versioned action.
 *
 * @example
 *   writeBaseline(root, refreezeBaseline(readOwnBaseline(root), current, byFile))
 */
export function refreezeBaseline(base, current, byFile) {
    const metrics = {};
    for (const [name, value] of Object.entries(current)) {
        const meta = base.metrics[name] ?? METRIC_DEFAULTS[name];
        if (meta)
            metrics[name] = { ...meta, value };
    }
    const uncoveredByFile = Object.fromEntries(Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b)));
    return { ...base, metrics, uncoveredByFile };
}
/**
 * Writes the baseline json, two-space indented with a final newline - the
 * shape `--update-baseline` diffs cleanly in a pull request.
 *
 * @example
 *   writeBaseline(root, refreezeBaseline(readOwnBaseline(root), current, byFile))
 */
export function writeBaseline(root, baseline) {
    writeFileSync(resolve(root, BASELINE_FILE), `${JSON.stringify(baseline, null, 2)}\n`);
}
