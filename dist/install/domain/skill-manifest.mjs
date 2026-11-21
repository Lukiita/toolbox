// Where every vendored skill came from (ADR-0003). ADR-0001 exists because
// copies of the skills drifted in silence: nobody could tell an edit made on
// purpose from a copy that simply got old. The manifest is what makes a copy
// answerable - per skill, the toolbox version it was taken from and the hash
// of the original content. "Intact" and "behind" are both read against it.
//
// The invariant it guards: a record always holds a real release number and a
// tree hash, under a name that is a plain folder name. Everything the
// installer writes is addressed by these names.
import { isReleaseNumber } from "./toolbox-version.mjs";
export class SkillManifestError extends Error {
}
const SCHEMA_VERSION = 1;
const TREE_HASH = /^sha256:[0-9a-f]{64}$/;
const FOLDER_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
const README = 'Written by `toolbox install` (ADR-0003 of @lukiita/toolbox). For each skill copied into ' +
    '.agents/skills/: the toolbox version it came from and the hash of the original. That is how ' +
    'an install tells a skill the project edited from one it did not, and which release to fetch ' +
    'the original from for a three-way merge. Edit a skill in .agents/skills/<name>, never this ' +
    'file. `toolbox skills` lists what differs.';
function assertFolderName(name) {
    if (FOLDER_NAME.test(name))
        return;
    throw new SkillManifestError(`skill name: received ${JSON.stringify(name)}, expected a folder name (letters, digits, ".", "_", "-")`);
}
function assertRecord(name, record) {
    if (!isReleaseNumber(record.version)) {
        throw new SkillManifestError(`skill "${name}": version received ${JSON.stringify(record.version)}, expected "<major>.<minor>.<patch>"`);
    }
    if (typeof record.hash !== 'string' || !TREE_HASH.test(record.hash)) {
        throw new SkillManifestError(`skill "${name}": hash received ${JSON.stringify(record.hash)}, expected "sha256:" followed by 64 hex digits`);
    }
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseJson(json) {
    try {
        return JSON.parse(json);
    }
    catch (e) {
        throw new SkillManifestError(`skills manifest is not valid JSON: ${e.message}`);
    }
}
function recordsOf(parsed) {
    if (!isPlainObject(parsed) || !isPlainObject(parsed.skills)) {
        throw new SkillManifestError(`skills manifest: received ${JSON.stringify(parsed)?.slice(0, 80)}, expected { "schemaVersion": ${SCHEMA_VERSION}, "skills": { "<name>": { "version", "hash" } } }`);
    }
    // A newer shape is refused, never guessed at: misreading a record could
    // mark an edited skill as intact, and the next install would replace it.
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
        throw new SkillManifestError(`skills manifest: schemaVersion received ${JSON.stringify(parsed.schemaVersion)}, expected ${SCHEMA_VERSION} - it was written by a newer toolbox; update the package`);
    }
    return parsed.skills;
}
export class SkillManifest {
    records = new Map();
    constructor() { }
    static empty() {
        return new SkillManifest();
    }
    /**
     * Reads a manifest file's content; throws `SkillManifestError` naming the
     * field and the value when the shape is wrong.
     *
     * @example
     *   SkillManifest.parse(readFileSync('.agents/toolbox-skills.json', 'utf8'))
     */
    static parse(json) {
        const manifest = new SkillManifest();
        for (const [name, record] of Object.entries(recordsOf(parseJson(json)))) {
            manifest.record(name, isPlainObject(record) ? record : {});
        }
        return manifest;
    }
    find(name) {
        return this.records.get(name);
    }
    names() {
        return [...this.records.keys()].sort();
    }
    /**
     * States that the project now holds `record.hash` as the skill's original.
     *
     * @example
     *   manifest.record('code-review', { version: '2.0.0', hash: shipped.hash })
     */
    record(name, record) {
        assertFolderName(name);
        assertRecord(name, record);
        this.records.set(name, { version: record.version, hash: record.hash });
    }
    /** Sorted and indented, so an update shows as a readable diff in the project. */
    serialize() {
        const skills = Object.fromEntries(this.names().map((name) => [name, this.records.get(name)]));
        return `${JSON.stringify({ _readme: README, schemaVersion: SCHEMA_VERSION, skills }, null, 2)}\n`;
    }
}
