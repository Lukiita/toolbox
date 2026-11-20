# ADR-0003 — Skills are vendored into the project, with a manifest

**Status:** Proposed (2026-11-20) — implemented in the same change; accepted by merging it. Amends ADR-0001 (how skills are delivered) and ADR-0002 (its premise); see "What changes in the earlier ADRs"

## Context

ADR-0001 delivers skills as symlinks: `toolbox install` links
`node_modules/@lukiita/toolbox/skills/<name>` into `.agents/skills/<name>`. It chose the
link because copies had drifted in silence: nobody could tell an edit made on purpose from
a copy that had simply got old.

A fifth consumer (project-e: a Java backend, two developers) showed four things the link
does not cover:

1. **Node in a repository that is not a Node project.** The repo needed a `package.json`,
   a lockfile and `pnpm install` on every clone only to have markdown files.
2. **The content is invisible in git.** The links are ignored (`/.agents/skills/*`), so a
   second developer cannot read in a pull request what the agents are told to do, and a
   change of skill version shows as one lockfile line. A clone without `pnpm install` (a
   cloud session, CI) has no skills at all.
3. **A skill the project must adapt beyond a decision.** `ddd-tactical` ships its templates
   in TypeScript. ADR-0002's decisions file can settle a choice the skill leaves open; it
   cannot turn a TypeScript template into a Java one.
4. **A skill reached another through the home directory.** Fifteen files spelled
   `~/.agents/skills/<skill>/…`, a path that exists only on a machine with the toolbox
   installed globally.

The risk of answering with a plain copy is the one ADR-0001 was written against, and it is
treated here as a requirement, not as a note.

## Decision

`toolbox install` **copies** the skills the package ships into the project, as real files
the project versions and may edit, and records where each copy came from:

```
.agents/skills/<name>/                  the project's copy - its to edit
.agents/toolbox/base/<name>/            the original of that copy, unedited
.agents/toolbox/skills-manifest.json    per skill: toolbox version + hash of the original
```

This is vendoring with a manifest (the model shadcn uses for components: the code enters
the repository and becomes the project's), plus a stored base so an update is a three-way
merge instead of a choice between "mine" and "theirs".

### Invariants

1. **Every copy knows where it came from.** The manifest holds, per skill, the toolbox
   version and the hash of the original content. It is versioned in the project.
2. **An edit the project made is never lost.** The only automatic write over an edited
   skill is a merge that settled every file. Anything short of that leaves the folder as
   it is and says why.
3. **Divergence is visible.** `toolbox skills` lists what the project edited and what is
   behind the package; `--diff` prints the diffs.
4. **A skill reaches a sibling from where it lives.** `<skill-dir>/../<name>/…`, never a
   path into the home directory. A test over the shipped skills holds this.
5. **A skill never moves backwards.** A toolbox older than the one that wrote a record
   does not touch that skill (a teammate with a stale `node_modules`).
6. **What the project deleted stays deleted.** A recorded skill whose folder is gone is
   not brought back.

### What install does with one skill

"Intact" means the folder's hash equals the recorded one; "new version" means the package
ships content whose hash differs from it.

| The manifest | The project's folder                             | The package   | Install                                                                | Reported          |
| ------------ | ------------------------------------------------ | ------------- | ---------------------------------------------------------------------- | ----------------- |
| no record    | absent                                           | —             | copies; records                                                        | `copied`          |
| no record    | a link the link-era install wrote, or a dangling | —             | replaces the link with a copy; records                                 | `copied`          |
| no record    | the project's own link to elsewhere              | —             | nothing                                                                | `pinned`          |
| no record    | a folder equal to the package's                  | —             | records it, writes no file in it                                       | `adopted`         |
| no record    | any other folder                                 | —             | nothing: it is the project's own skill                                 | `unmanaged`       |
| a record     | absent                                           | any           | nothing                                                                | `removed`         |
| a record     | intact                                           | same          | nothing (the record moves to the running version)                      | `unchanged`       |
| a record     | intact                                           | new version   | replaces the folder and the base                                       | `updated`         |
| a record     | edited                                           | same          | nothing                                                                | `altered`         |
| a record     | edited                                           | new version   | three-way merge; every file settled: writes it, moves the base         | `merged`          |
| a record     | edited                                           | new version   | a file both sides changed in the same place: **writes nothing**        | `conflict`        |
| a record     | edited                                           | new version   | the same, with `--write-conflicts`: writes the markers, moves the base | `conflict-marked` |
| a record     | edited                                           | new version   | the base is gone or was edited: nothing                                | `base-lost`       |
| a record     | any                                              | not shipped   | nothing                                                                | `retired`         |
| newer record | any                                              | older toolbox | nothing                                                                | `ahead`           |

A conflict holds back the **whole skill**, not only the conflicting file: half an update is
a version of the skill nobody wrote.

### The merge

File by file, the base says who moved. One side moved (an edit, a new file, a deletion):
that side wins. Both moved the same way: nothing to do. Both moved differently: the line
merge decides (`git merge-file --diff3`), and what it cannot settle is a conflict. A file
edited on one side and deleted on the other, or binary on both, is a conflict that keeps
the project's side.

### What is hashed

A skill's hash is sha256 over `<path>\0<sha256 of the file>\n` for each file, paths in
code-unit order. Left out on purpose, because each would make an unedited skill read as
edited: the exec bit, CRLF vs LF in text files (`core.autocrlf` rewrites them on checkout),
and what running a skill's script leaves behind (`__pycache__/`, `*.pyc`, `.DS_Store`).
The format is a contract with every manifest already written; a test pins it to values
computed with `sha256sum`.

### The source is the running package

`toolbox install` copies from the package that is running, not from the project's
`node_modules`. A repository with no `package.json` runs it from a cache:
`pnpm dlx github:Lukiita/toolbox#vX.Y.Z install`. Node is needed where the update is run,
not on every clone.

## Alternatives rejected

- **Keep the link and copy only the skill a project wants to edit.** Less to merge, but it
  solves neither the content hidden from git nor Node in a non-Node repository, and it
  leaves two delivery modes to keep working.
- **Copy and keep; warn, never merge.** The simplest. Every update of an edited skill
  becomes a merge by hand, so an edited skill in practice stops being updated: the drift
  again, only reported this time.
- **Fetch the base from the old tag when a merge is needed** (how Copier updates a
  template). Nothing stored twice in the project, but it puts the network, GitHub and tag
  naming inside `install`, and this repository's history was rewritten once already.
- **Conflict markers written by default** (what `git merge` does). A `SKILL.md` with
  markers is a broken skill an agent reads without noticing, and a project that runs
  `toolbox install` from `postinstall` would get them written unattended.
- **The link as a config option.** Two modes are two test matrices and every cross-skill
  reference would have to hold in both; no consumer needs the link.
- **Rewriting paths at copy time** (`~/.agents/skills/` → `.agents/skills/`). The copy
  would differ from the package by construction, and "intact" would need a second hash.

## What changes in the earlier ADRs

**ADR-0001.** Superseded: the paragraph "Skills are files. `toolbox install` … links …",
and with it the `postinstall` deviation as far as skills go. Unchanged: one package,
a tag is a version, the config holds what a project used to edit in copied **code**,
`dist/` is committed, and hooks and the quality gate run from the package and are never
edited in a project. ADR-0001 prevented drift in skills by construction; from here it is
bounded instead: recorded, reported and merged. "A fix lands in the library or nowhere"
still holds for code. For a skill, a fix made in a project comes back as a pull request
here, and `toolbox skills --diff` is what shows it waiting.

**ADR-0002.** Its premise, "a project cannot edit a skill", no longer holds, and "editing
the copy" leaves its list of rejected alternatives. The decision stands and stays the
first choice: a decision written in `.agents/skill-decisions/<skill>.md` leaves the skill
unedited, and an unedited skill updates with no merge at all. Editing the skill is for
what a decisions file cannot express.

## Consequences

- **Gained:** the skills are in git and in the pull request; a clone needs nothing
  installed to have them; a project adapts a skill and still receives its updates.
- **Paid:** every skill is in the repository twice (97 files, about 1.2 MB today; a line
  `.agents/toolbox/base/** linguist-generated=true` in `.gitattributes` keeps the base
  out of GitHub's diffs); an update is a commit to review in each project, not a lockfile
  line; a conflict waits for a person; a fix made in a project does not travel back by
  itself.
- **Risk:** somebody edits the base instead of the skill. Its hash no longer matches the
  record, so it is reported (`base-lost`) and never merged against.
- **SemVer:** major. `install` changed what it writes and who owns the result.

## Migration of a link-era consumer

1. Remove the ignore rule for `.agents/skills/` from `.gitignore`, where there is one.
2. Move to the new version and run `toolbox install`: each link becomes a copy.
3. Drop `"postinstall": "toolbox install"`: a clone already has the files. From here
   `toolbox install` is the step after an update of the package.
4. Commit `.agents/skills/` and `.agents/toolbox/`.
