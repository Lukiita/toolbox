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

`toolbox install` **copies** the skills a project picks into the project, as real files
the project versions and may edit, and records where each copy came from:

```
.agents/skills/<name>/        the project's copy - its to edit
.agents/toolbox-skills.json   the manifest - per skill: toolbox version + hash of the original
```

This is vendoring with a manifest (the model shadcn uses for components: the code enters
the repository and becomes the project's). An update of a skill the project edited is a
three-way merge, not a choice between "mine" and "theirs" - and the third side, the
original the project copied, is **not kept in the project**: the manifest names the
release it came from, and `install` fetches that release's tag when a merge needs it (how
Copier updates a project from its template).

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
   does not touch that skill, and does not call "retired" a skill a newer one added (a
   teammate with a stale `node_modules`).
6. **A project gets the skills it picked, and only those.** A shipped skill it did not ask
   for is offered, never copied. Deleting a skill's folder is how a project stops wanting
   it: the record goes with the folder, and the skill is not brought back.
7. **One skill that cannot be settled does not stop the others.** It is reported `failed`
   with the reason, and the command exits 1.
8. **Nothing is read or written through a symbolic link.** A project is somebody else's
   content: a link committed under a name the toolbox uses must never make it touch what
   the link points at. So every path it owns in a project is looked at without following
   it. A link where the manifest goes is refused. A link under one of the names a write
   keeps beside a skill (`<name>.toolbox-staging`, `<name>.toolbox-old`,
   `<name>.toolbox-swap`) is unlinked. A link in a skill's place is the 1.x install's
   (replaced by a copy) or the project's own (`pinned`), and is never read through. Only
   the path itself is not followed: a project whose `.agents/` is a link elsewhere keeps
   working. One test file plants a link under each of these names.

### Picking skills

Not every skill fits every repository (a Java backend has no use for the Husky setup), so
a project installs a selection, and the manifest is that selection: a skill with a record
is one the project has.

```
toolbox install <skill>...     adds those skills to the ones the project has
toolbox install --all          adds every skill the package ships
toolbox install                brings what the project has up to date, adds nothing
```

Every form also settles the skills already recorded. A project with no skill yet that
names none gets a picker when it runs in a terminal: the list of skills with a line about
each, arrows to move, space to pick, `a` for all, enter to confirm; closed without
confirming, nothing is installed and the command exits 130. A script or an agent gets the
list and exit code 2 instead, because guessing "all" for them would undo the point of
picking. The picker is built on Node's own `readline`, not a prompt library: a dependency
would land in every consumer's `node_modules` for a question asked once. The links a 1.x
install wrote count as the selection of that project: each becomes a copy.

A skill installed without the sibling it calls has a dead path in it. So a skill on its
way in brings the siblings its files reach (read from the same `<skill-dir>/../<name>/`
references invariant 4 holds), reported `copied … needed by <skill>`. Only on the way in:
a skill the project already has does not bring back a sibling the project deleted.

### What install does with one skill

"Intact" means the folder's hash equals the recorded one; "new version" means the package
ships content whose hash differs from it.

| The manifest | The project's folder                        | The package   | Install                                                              | Reported          |
| ------------ | ------------------------------------------- | ------------- | -------------------------------------------------------------------- | ----------------- |
| any          | absent, and the skill was asked for         | —             | copies; records                                                      | `copied`          |
| no record    | absent, not asked for                       | —             | nothing                                                              | `available`       |
| any          | a link the 1.x install wrote, or a dangling | —             | replaces the link with a copy; records                               | `copied`          |
| any          | the project's own link to elsewhere         | —             | nothing                                                              | `pinned`          |
| no record    | a folder equal to the package's             | —             | records it, writes no file in it                                     | `adopted`         |
| no record    | any other folder                            | —             | nothing: it is the project's own skill, asked for or not             | `unmanaged`       |
| a record     | absent, not asked for                       | any           | drops the record                                                     | `removed`         |
| a record     | intact                                      | same          | nothing (the record moves to the running version)                    | `unchanged`       |
| a record     | already equal to the package's              | new version   | nothing (the record moves): applied by hand, or a run that died      | `unchanged`       |
| a record     | intact                                      | new version   | replaces the folder                                                  | `updated`         |
| a record     | edited                                      | same          | nothing (the record moves to the running version)                    | `altered`         |
| a record     | edited                                      | new version   | fetches the original; three-way merge; every file settled: writes it | `merged`          |
| a record     | edited                                      | new version   | a file both sides changed in the same place: **writes nothing**      | `conflict`        |
| a record     | edited                                      | new version   | the same, with `--write-conflicts`: writes the merge, see below      | `conflict-marked` |
| a record     | edited                                      | new version   | the original cannot be fetched, or is not the recorded one: nothing  | `no-original`     |
| a record     | present                                     | not shipped   | nothing                                                              | `retired`         |
| newer record | any                                         | older toolbox | nothing, shipped or not                                              | `ahead`           |
| any          | cannot be read or written                   | any           | nothing more for this skill; the others go on                        | `failed`          |

A conflict holds back the **whole skill**, not only the conflicting file: half an update is
a version of the skill nobody wrote. In every row that writes, the record moves to the
running version and to the hash of what the package ships.

`--write-conflicts` is "write what you have and let me settle it": the merged skill is
written and the record moves. A file whose text both sides changed carries git's conflict
markers. A file edited on one side and deleted on the other, added on both, or binary has
no text to mark: it keeps the project's side, and is named in the report with the others.

### The merge

The original is the skill as the recorded release shipped it. File by file, it says who
moved. One side moved (an edit, a new file, a deletion):
that side wins. Both moved the same way: nothing to do. Both moved differently: the line
merge decides (`git merge-file --diff3`), and what it cannot settle is a conflict. A file
edited on one side and deleted on the other, or binary on both, is a conflict that keeps
the project's side.

Text is merged as bytes and compared with LF line endings, the way the hash reads it: no
byte of a file is rewritten for being outside UTF-8, and a checkout with CRLF
(`core.autocrlf`) merges like any other and gets its line endings back.

### Replacing a folder

A skill's folder is never deleted to be rewritten. The new content is written beside it,
the old folder is renamed aside and the new one renamed into place - two atomic renames,
the first undone when the second fails - and only then is the old one deleted, best
effort. A failure at any point leaves a whole folder and no half-written one beside it. A
marker file names the folder set aside while the two renames are under way; a run killed
between them is undone by the next install, from that marker, before it reads anything.
An old folder that could not be deleted is named in the report, never left unsaid. The
manifest is saved even when the run stops early, so a skill already written is never left
under a stale record.

While the two renames are under way a marker names what was set aside, and a write that
dies between them is undone from it: a folder is put back, and so is the link a 1.x
install wrote, which is then judged like any link in a skill's place. The marker is
removed only when the swap, or its undoing, succeeded.

### The original comes from the release's tag

`install` clones the tag `v<recorded version>` of the package's own repository
(`repository` in its `package.json`), without history, into a temp folder it removes at
the end. It happens only when an edited skill meets a new version, once per release per
run. The fetched skill must hash to what the manifest recorded, or it is not merged
against: a moved tag, or a release packed differently, would make edits out of what the
project never touched.

This is the one step that leaves the machine, and it never fails the install. No network,
a deleted tag, a remote that hangs (cut at 60 s) or one that asks for credentials (git is
told not to prompt): the skill is left exactly as it is and reported `no-original` with
git's own reason; every other skill is still installed. There is no retry: the command is
re-run by a person, and the edited skills copied from one release must cost one failed
fetch, not one timeout each.

When a release can never be fetched again, the way out is by hand: delete the skill's
folder and run `toolbox install <name>` (it is `copied` anew), then re-apply the edits
from git. The manifest is never edited by hand.

### What is hashed

A skill's hash is sha256 over `<path>\0<sha256 of the file>\n` for each file, paths in
code-unit order. Left out on purpose, because each would make an unedited skill read as
edited: the exec bit, CRLF vs LF in text files (`core.autocrlf` rewrites them on checkout),
and what running a skill's script leaves behind (`__pycache__/`, `*.pyc`, `.DS_Store`).
Only regular files are read, and no symbolic link is followed: a link inside a skill, to
a file or to a folder, is in no hash, never pulls outside content into a diff or a merge,
and does not survive a write of the folder. A known limit - no shipped skill has one.
A shipped skill is read the same from the installed package, from a checkout and from a
fetched tag: what `package.json`'s `files` keeps out of the package (`test_*.py`) is left
out of all three, or a fetched original would never match its record. The format is a
contract with every manifest already written; a test pins it to values computed with
`sha256sum`.

### `toolbox skills` stays offline

It reads the manifest, the project's folders and the running package, nothing else. With
no copy of the original at hand, whose change a file carries is known only while one side
still equals the original: an edited skill is compared with the package when the package
did not move, a waiting version with the project's folder when that is unedited. When
both moved, the differing files are listed as one set, unattributed; `install` is what
fetches the original and settles them.

### The source is the running package

`toolbox install` copies from the package that is running, not from the project's
`node_modules`. A repository with no `package.json` runs it from a cache:
`pnpm dlx github:Lukiita/toolbox#vX.Y.Z install`. Node is needed where the update is run,
not on every clone.

## Alternatives rejected

- **Copy every shipped skill and let the project delete what it does not want.** The
  first cut. A repository that only wanted three skills got sixteen, reviewed sixteen in
  its first pull request, and had to know which ones to delete. Picking on the way in
  costs one question and a list.
- **Keep the link and copy only the skill a project wants to edit.** Less to merge, but it
  solves neither the content hidden from git nor Node in a non-Node repository, and it
  leaves two delivery modes to keep working.
- **Copy and keep; warn, never merge.** The simplest. Every update of an edited skill
  becomes a merge by hand, so an edited skill in practice stops being updated: the drift
  again, only reported this time.
- **Keep the original in the project** (`.agents/toolbox/base/<name>/`). The first cut of
  this change: the merge and `toolbox skills` work offline and name every file's side. It
  puts every skill in the repository twice, about a hundred files a reviewer scrolls past
  on every update; rejected for that.
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
  installed to have them; a project carries only the skills that fit it, adapts them and
  still receives their updates; the project carries one extra file, the manifest.
- **Paid:** merging an edited skill needs the network and the tag of the release it was
  copied from, so `install` now depends on where the package is hosted and on tags named
  `vX.Y.Z` that are never moved or deleted; an update is a commit to review in each
  project, not a lockfile line; a conflict waits for a person; a fix made in a project
  does not travel back by itself; `toolbox skills` cannot attribute the changes of a
  skill both sides moved.
- **Risk:** a release that can no longer be fetched (this repository's history was
  rewritten once, in 2026-09) leaves an edited skill unmergeable; it is reported, never
  guessed at, and re-applied by hand.
- **SemVer:** major. `install` changed what it writes and who owns the result.

## Migration of a link-era consumer

1. Remove the ignore rule for `.agents/skills/` from `.gitignore`, where there is one.
2. Move to the new version and run `toolbox install`: each link becomes a copy, and
   the skills the project had linked are its selection. Delete the folders it does not want.
3. Drop `"postinstall": "toolbox install"`: a clone already has the files. From here
   `toolbox install` is the step after an update of the package.
4. Commit `.agents/skills/` and `.agents/toolbox-skills.json`.
