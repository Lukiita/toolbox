// Where one skill stands, decided in one place (ADR-0003). `toolbox install`
// acts on this state and `toolbox skills` shows it: read twice, by two
// modules, the two commands drifted - `skills` announced a merge for a skill
// `install` was about to leave alone (found in review).
//
// Two questions, both answered against the manifest's record:
// - the project's side: did the project edit the skill, or delete it?
// - the package's side: does the running package ship something else?
import { isOlderVersion } from "./toolbox-version.mjs";
// The project already holds what the package ships: the new version applied
// by hand, or an install that died after writing the folder and before saving
// the manifest. The record is stale; the skill is neither edited nor behind.
function holdsShipped({ local, shipped }) {
    return local !== undefined && shipped !== undefined && local.equals(shipped);
}
function localState(snapshot) {
    const { record, local } = snapshot;
    if (!local)
        return 'removed';
    return local.hash === record.hash || holdsShipped(snapshot) ? 'intact' : 'altered';
}
function upstreamState(snapshot, runningVersion) {
    const { record, shipped } = snapshot;
    // A teammate with a stale node_modules: what their package ships is older
    // than the record, never something to move the project's skill to. Asked
    // before "is it shipped at all": a skill a newer toolbox added is not
    // shipped by the older one, and "retired - delete it" would be obeyed.
    if (isOlderVersion(runningVersion, record.version))
        return 'ahead';
    if (!shipped)
        return 'retired';
    return shipped.hash === record.hash || holdsShipped(snapshot) ? 'current' : 'behind';
}
/**
 * Where a skill stands between the manifest, the project and the running package.
 *
 * @example
 *   classifySkill({ record, local, shipped }, '2.1.0')
 *   // => { local: 'altered', upstream: 'behind' }
 */
export function classifySkill(snapshot, runningVersion) {
    const { record, local } = snapshot;
    if (!record)
        return { local: local ? 'unmanaged' : 'not-installed', upstream: 'untracked' };
    const recorded = { ...snapshot, record };
    return { local: localState(recorded), upstream: upstreamState(recorded, runningVersion) };
}
