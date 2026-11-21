// A mistake in what was typed to one of the feature's commands: a flag it does
// not know, a skill the package does not ship, no skill named where one was
// needed. One class for all of them, thrown from wherever the mistake is
// found; the CLI answers it with the usage text and exit code 2. Three
// classes once covered this one idea, one of them borrowed from another
// feature (found in review).
export class SkillCommandUsageError extends Error {}
