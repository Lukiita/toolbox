// Quality gate - the frozen-baseline ratchet, as a function.
//
// Collects deterministic metrics, compares them with `quality-baseline.json`
// and reports what got worse. Zero model cost: the same class as the Archon
// bash nodes, which cost US$ 0.00 in a US$ 21.92 run. In Building
// Evolutionary Architectures terms, this is an architectural fitness
// function of the trend kind: it gates on direction, not on a threshold.
//
// A function, not a script: the CLI (`toolbox quality`) and the pre-push hook
// (`toolbox pre-push`) both call it, and the result carries the failures so
// a caller decides what to print and how to exit. The report language is per
// project: `"language": "en" | "pt"` in the baseline json (see locale.mts).
import { baselineChangedSince, readComparisonBaseline, readOwnBaseline, refreezeBaseline, writeBaseline, } from "./baseline-store.mjs";
import { compareFileCounts, compareMetrics } from "./compare.mjs";
import { stringsFor } from "./locale.mjs";
import { measureRepository } from "./measure.mjs";
import { PLACE_RULE_HOMES } from "./place-rule.mjs";
import { buildReport } from "./report.mjs";
const sample = (items, max) => items.slice(0, max);
function architectureDetails(m, t) {
    return [
        {
            title: t.pureRulesTitle(m.displacedRules.length, PLACE_RULE_HOMES),
            items: m.displacedRules.map((f) => `\`${f}\``),
        },
        {
            title: t.cyclesTitle(m.cycles.length),
            items: sample(m.cycles, 10).map((c) => [...c, c[0]].map((f) => `\`${f}\``).join(' → ')),
        },
    ];
}
function sizeAndTypeDetails(m, config, t) {
    return [
        {
            title: t.filesOverLimitTitle(config.lineLimit, m.oversized.length),
            items: m.oversized.map((g) => `\`${g.file}\` — ${g.lines}`),
        },
        {
            title: t.overComplexTitle(config.ccLimit, m.complexFns.length),
            items: sample(m.complexFns, 20).map((f) => `\`${f.file}:${f.line}\` ${f.name} — CC ${f.cc}`),
        },
        {
            title: t.explicitAnyTitle(m.anys.length),
            items: sample(m.anys, 20).map((a) => `\`${a.file}\` — ${a.count}`),
        },
    ];
}
function coverageDetails(m, t) {
    return [
        {
            title: t.uncoveredFilesTitle(m.uncovered.length),
            items: sample(m.uncovered, 20).map((d) => t.uncoveredFileItem(d.file, d.lines.length, d.percent)),
        },
    ];
}
function reportDetails(m, config, t) {
    return [
        ...architectureDetails(m, t),
        ...sizeAndTypeDetails(m, config, t),
        ...coverageDetails(m, t),
    ];
}
function refreeze(env, m) {
    writeBaseline(env.root, refreezeBaseline(readOwnBaseline(env.root), m.current, m.byFile));
    return { status: 'refrozen', failures: [], current: m.current };
}
function compareAndReport(env, measurement, baselineFrom) {
    const { base, origin } = readComparisonBaseline(env.root, baselineFrom, env.warn);
    const t = stringsFor(base.language);
    const failures = [
        ...compareMetrics(base, measurement.current, t),
        ...compareFileCounts(base.uncoveredByFile ?? {}, measurement.byFile, t),
    ];
    const report = buildReport({
        baseline: base,
        current: measurement.current,
        failures,
        details: reportDetails(measurement, env.config, t),
        generatedAt: new Date().toISOString(),
        baselineOrigin: origin,
        baselineChanged: origin ? baselineChangedSince(env.root, origin) : false,
    }, t);
    const status = failures.length > 0 ? 'failed' : 'passed';
    return { status, failures, current: measurement.current, report };
}
/**
 * Runs the ratchet once. Never exits the process; the caller maps the status
 * and writes `--out` itself - so an unwritable path never loses the report
 * from the log (found in review).
 *
 * @example
 *   const result = runQualityGate({ root, config, warn: console.error }, { skipTests: true, updateBaseline: false });
 *   if (result.status === 'failed') process.exitCode = 1;
 */
export function runQualityGate(env, options) {
    const measurement = measureRepository({
        root: env.root,
        config: env.config,
        skipTests: options.skipTests,
    });
    if (options.updateBaseline)
        return refreeze(env, measurement);
    return compareAndReport(env, measurement, options.baselineFrom);
}
