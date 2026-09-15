// The markdown report - the same thing that goes to the terminal, the job
// summary and the PR comment.
//
// Pure on purpose: the report is what a person reads to decide, so it has a
// test. And the HTML marker at the top is what lets CI **edit** the same
// comment on every push instead of stacking one per commit.
export const MARKER = '<!-- quality-gate -->';
// Delimit the regressions block so a consumer (the pre-push hook) can cut it
// out without matching the localized heading - the heading is a locale string,
// and a hook that greps it breaks the day the string is edited.
export const REGRESSIONS_START = '<!-- regressions -->';
export const REGRESSIONS_END = '<!-- /regressions -->';
function delta(value, base, unit) {
    const d = Math.round((value - base) * 100) / 100;
    if (d === 0)
        return '—';
    return `${d > 0 ? '+' : ''}${d}${unit ?? ''}`;
}
export function buildReport(input, t) {
    const { baseline, current, failures, generatedAt } = input;
    const lines = [MARKER, '', t.reportTitle, ''];
    lines.push(failures.length === 0 ? t.statusPassed : t.statusFailed(failures.length), '');
    if (input.baselineChanged) {
        lines.push(...t.baselineChangedNotice, '');
    }
    // One table per section, in the order the metrics appear in the baseline.
    const sections = [];
    for (const m of Object.values(baseline.metrics)) {
        if (!sections.includes(m.section))
            sections.push(m.section);
    }
    for (const section of sections) {
        lines.push(`### ${section}`, '');
        lines.push(t.tableHeader, '| --- | ---: | ---: | ---: |');
        for (const [name, m] of Object.entries(baseline.metrics)) {
            if (m.section !== section)
                continue;
            const value = current[name];
            if (value === undefined)
                continue;
            const u = m.unit ?? '';
            lines.push(`| ${m.label} | ${m.value}${u} | ${value}${u} | ${delta(value, m.value, u)} |`);
        }
        lines.push('');
    }
    if (failures.length > 0) {
        lines.push(REGRESSIONS_START, t.regressionsTitle, '');
        for (const f of failures)
            lines.push(`- ${f.message}`);
        // The advice stays outside the block: a consumer that cuts the block out
        // (the pre-push hook) prints its own advice, and two would contradict.
        lines.push(REGRESSIONS_END, '');
        lines.push(...t.ratchetAdvice, '');
    }
    for (const d of input.details ?? []) {
        if (d.items.length === 0)
            continue;
        lines.push(`<details><summary>${d.title}</summary>`, '');
        for (const item of d.items)
            lines.push(`- ${item}`);
        lines.push('', '</details>', '');
    }
    const origin = input.baselineOrigin ? t.baselineOriginSuffix(input.baselineOrigin) : '';
    lines.push(t.footer(generatedAt, origin));
    return lines.join('\n');
}
