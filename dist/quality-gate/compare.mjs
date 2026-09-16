// Comparison against the baseline - the heart of the ratchet.
//
// Two modes, because a new project and an existing one need different things:
//
//   - `baseline`: freezes the value measured today and forbids getting worse.
//     The mode for a repo with a past - you don't fix everything at once, but
//     you don't add more debt either.
//   - `floor`: requires a chosen minimum/maximum, regardless of what exists.
//     The mode for a fresh repo, where there is no past to freeze and "no
//     worse" would be vacuously true.
//
// The golden rule is the one from the video that originated this: a PR may add
// code, but may not worsen any metric - not even by one unit.
function worsened(direction, limit, current) {
    return direction === 'lower-is-better' ? current > limit : current < limit;
}
/**
 * Per-file ratchet. It exists because the global sum does NOT work: measured
 * on 2026-08-05 against `e6d4144`, `actions.ts` went from 208 to 213 uncovered
 * lines - the regression CodeRabbit flagged - while the repo total dropped
 * from 799 to 792, because the same feature covered other things. A single
 * number lets the local regression hide behind someone else's improvement.
 *
 * A file absent from the baseline counts as 0: new code with uncovered lines
 * is exactly the case to catch. When deliberate, re-freeze.
 */
export function compareFileCounts(baseline, current, t) {
    const failures = [];
    for (const [file, value] of Object.entries(current)) {
        const limit = baseline[file] ?? 0;
        if (value <= limit)
            continue;
        failures.push({
            metric: file,
            limit,
            current: value,
            message: t.fileRegressed(file, limit, value),
        });
    }
    return failures.sort((a, b) => b.current - b.limit - (a.current - a.limit));
}
/** The entry the compared commit holds for a metric, under its current or its former key. */
function comparedEntry(compared, metric, renamedFrom) {
    const direct = compared.metrics[metric];
    if (direct)
        return direct;
    const previous = renamedFrom[metric];
    if (previous === undefined)
        return undefined;
    return compared.metrics[previous];
}
/**
 * The baseline this run actually compares against when `--baseline-from`
 * points at ANOTHER revision (CI passes the pull request's base). Resolved
 * ONCE, so the comparison and the report can never disagree - the first
 * attempt threaded a fallback into the comparison alone, and the PR report
 * came out with every table empty.
 *
 * Three owners, split by what each is authoritative about:
 *
 *   - the ENGINE owns what a metric MEANS: `direction`, `mode` and `gate`.
 *     Those are facts about the measurement, not project data; `semantics`
 *     carries them from `METRIC_DEFAULTS`, which lives in compiled code.
 *   - the compared commit owns the NUMBER, under the metric's current key or
 *     the one it was renamed from (`renamedFrom`, also code: a map read from
 *     the baseline file would let the PR choose which frozen number it is
 *     measured against).
 *   - the local project owns the NAME: `section` and `label`, plus the report
 *     language - today's preference, not a frozen number.
 *
 * A metric the compared commit genuinely never had keeps the local floor and
 * is named in `fromLocalFloor`: that number is the one thing with no other
 * source, so the report says out loud that the PR is approving itself for it
 * rather than printing a silent green. The per-file map stays the compared
 * commit's: file names were not renamed, and the branch's own map would let a
 * file's regression approve itself.
 *
 * Provenance: born in project-b (2026-08-19) as reconcileBaselineFromRev,
 * brought to the toolbox by issue #1; project-a's copy then found four
 * self-approval routes in review (2026-09-02, rounds 4, 6, 7, 8 - each pinned
 * in compare.test.ts) and split it on the engine-versus-data axis. Ported
 * back by issue #8. Pure: takes both baselines, returns a new one.
 *
 * @example
 *   effectiveBaseline(base, own, LEGACY_METRIC_KEYS, METRIC_DEFAULTS)
 */
export function effectiveBaseline(compared, local, renamedFrom = {}, semantics = {}) {
    requireInjectiveRenames(renamedFrom);
    const metrics = {};
    const fromLocalFloor = [];
    for (const [metric, meta] of Object.entries(local.metrics)) {
        const previous = comparedEntry(compared, metric, renamedFrom);
        if (previous === undefined)
            fromLocalFloor.push(metric);
        metrics[metric] = withEngineSemantics(resolved(meta, previous), semantics[metric]);
    }
    return {
        baseline: { ...local, metrics, uncoveredByFile: compared.uncoveredByFile },
        fromLocalFloor,
    };
}
/**
 * The layer under the engine's word: the compared commit's entry when it has
 * one, otherwise the local entry forced to gate. Three layers because each
 * was found the hard way: remove the engine and `direction` becomes editable
 * in the PR; remove this and a metric with no engine default reads its flags
 * from the file under review.
 */
function resolved(local, previous) {
    if (previous === undefined)
        return { ...local, gate: true };
    return { ...previous, section: local.section, label: local.label };
}
/** Absent semantics leaves the entry alone - a metric the engine has no defaults for. */
function withEngineSemantics(entry, semantics) {
    if (semantics === undefined)
        return entry;
    return {
        ...entry,
        direction: semantics.direction,
        mode: semantics.mode,
        gate: semantics.gate !== false,
    };
}
/**
 * Two metrics pointing at the same former key both read that key's number,
 * `fromLocalFloor` stays empty, and a regression passes silently - one typo
 * in a hand-maintained map is a silent green, the one outcome a gate may
 * never produce (review 2026-09-02, round 4).
 */
function requireInjectiveRenames(renamedFrom) {
    const targets = Object.values(renamedFrom);
    const duplicated = targets.find((target, i) => targets.indexOf(target) !== i);
    if (duplicated === undefined)
        return;
    throw new Error(`renamedFrom maps more than one metric onto \`${duplicated}\`; each former key names exactly one measurement`);
}
/**
 * Returns the metrics that regressed. A metric present in the measurement and
 * absent from the baseline **fails**: an incomplete baseline would be a gate
 * that approves what it does not know, and the fix (`--update-baseline`) is
 * one line. Feed it the result of `effectiveBaseline`, never a raw compared
 * commit: a metric this project renamed or adopted after that commit is
 * resolved there.
 */
export function compareMetrics(baseline, current, t) {
    const failures = [];
    for (const [metric, value] of Object.entries(current)) {
        const expected = baseline.metrics[metric];
        if (!expected) {
            failures.push({
                metric,
                limit: Number.NaN,
                current: value,
                message: t.metricNotInBaseline(metric),
            });
            continue;
        }
        if (expected.gate === false)
            continue;
        if (!worsened(expected.direction, expected.value, value))
            continue;
        const suffix = expected.unit ?? '';
        const kind = expected.mode === 'floor' ? t.floorWord : t.baselineWord;
        failures.push({
            metric,
            limit: expected.value,
            current: value,
            message: t.metricRegressed(expected.label, `${expected.value}${suffix}`, `${value}${suffix}`, kind),
        });
    }
    return failures;
}
