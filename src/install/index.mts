// Public API of the `install` feature: the skills a project gets from the
// toolbox (ADR-0003). Code outside `src/install/` imports from here and
// nowhere deeper - what this file does not export is private to the feature,
// free to move between its layers.
//
// Exported: the two commands (`toolbox install`, `toolbox skills`), the
// adapters each needs wired in by whoever calls it (the CLI is the one place
// that picks git for the merge, the diff and the past releases), and the
// lines the commands print.

export {
  inspectSkills,
  type InspectSkillsOptions,
  skillDiffs,
  type SkillInspection,
} from './application/inspect-skills.mts';
export {
  installSkills,
  type InstallSkillsOptions,
  type SkillInstallReport,
} from './application/install-skills.mts';
export { gitFileDiff } from './infra/git-file-diff.mts';
export { GitPastReleases, repositoryCloneUrl } from './infra/git-past-releases.mts';
export { gitTextMerge } from './infra/git-text-merge.mts';
export { inspectionLines, installLine } from './presentation/skill-report-lines.mts';
