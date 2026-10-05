# ADR-0002 — A project's decisions over a skill live in the project, outside the skill

**Status:** Proposed (2026-10-05) — implemented for `ddd-tactical` in the same change; accepted by merging it

## Context

A skill ships defaults, and some of them are a project's to settle: `ddd-tactical` leaves
open which typed-id recipe a project uses, whether `restore` validates, whether domain
events are dispatched. A project may also depart from a default for a reason of its own.

Under ADR-0001 a project cannot edit a skill: `toolbox install` links
`node_modules/@lukiita/toolbox/skills/<name>` into `.agents/skills/<name>`. The projects
that still hold a copy can edit it, and every edit is the drift ADR-0001 exists to end.

project-d found the middle path by hand: it kept its copy of `ddd-tactical` unedited and
wrote what it had settled differently in a `PROJECT.md` inside the copy, plus one notice
added to `SKILL.md` telling the agent to read that file first. The idea is right and the
place is not: once the copy becomes a link, `.agents/skills/ddd-tactical/` IS the package
directory, and a file written there is unversioned and gone at the next update (found in
the review of the change that first made the file official, 2026-10-05).

## Decision

A project writes what it settled differently from a skill in
**`.agents/skill-decisions/<skill>.md`**: its own versioned file, beside the skills and
outside any of them.

A skill that honours the convention says so at the top of its `SKILL.md`: read that file
first when it exists; it wins wherever the two disagree. The file holds decisions, each with
a pointer to its reasons (an ADR, where the project keeps them). It is a layer over the
skill, never a fork of it.

## Alternatives rejected

- **Inside the skill's directory** (`<skill>/PROJECT.md`, what project-d did): lost under
  the link, as above.
- **A field in `toolbox.config.ts`**: that file is ADR-0001's home for what a project used
  to edit inside copied CODE, read by code. A skill decision is prose read by an agent and
  usually carries its reason ("legacy database: `restore` is lenient"); a config field
  cannot hold the why, and the agent would need a second hop to find it.
- **The project's `AGENTS.md` alone**: always loaded, so every line costs on every turn,
  and project-d's decisions over one skill run to about ninety lines. One pointer line
  there is welcome; the content is not.
- **Editing the copy**: the drift again, and impossible once the skill is a link.

## Consequences

- **Gained:** a project is never locked to a skill's default, an update of the skill never
  overwrites a local decision, and the references stay generic.
- **Paid:** one more place a project keeps decisions, beside `CONTEXT.md`, `docs/adr/` and
  `.specs/`. The bound that keeps it small: it holds only choices a skill leaves to the
  project or defaults the project departs from, and the reasons stay in the ADRs.
- **Opt-in per skill:** a skill that does not say it reads the file does not. `ddd-tactical`
  is the first.
- **project-d** moves its `PROJECT.md` to the new path when it drops its copy, or sooner;
  until then its hand-added notice keeps working.
