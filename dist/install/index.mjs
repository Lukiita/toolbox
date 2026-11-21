// Public API of the `install` feature: the skills a project gets from the
// toolbox (ADR-0003). Code outside `src/install/` imports from here and
// nowhere deeper - what this file does not export is private to the feature,
// free to move between its layers.
//
// Exported: the two commands (`toolbox install`, `toolbox skills`), the
// adapters each needs wired in by whoever calls it (the CLI is the one place
// that picks git for the merge, the diff and the past releases), and the
// lines the commands print.
export { inspectSkills, skillDiffs, } from "./application/inspect-skills.mjs";
export { installSkills, } from "./application/install-skills.mjs";
export { gitFileDiff } from "./infra/git-file-diff.mjs";
export { GitPastReleases, repositoryCloneUrl } from "./infra/git-past-releases.mjs";
export { gitTextMerge } from "./infra/git-text-merge.mjs";
export { inspectionLines, installLine } from "./presentation/skill-report-lines.mjs";
