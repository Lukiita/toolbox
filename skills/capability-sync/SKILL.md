---
name: capability-sync
description: Maintains the project's living behavioral contract — durable capability files in `.specs/capabilities/` that accumulate verified behavior across features, in Requirement/Scenario (SHALL + WHEN/THEN) format. Use (1) as the closing step of a tlc-spec-driven feature — validation Step 11 after validation.md reaches PASS — fold its verified requirements into the capability files; (2) to migrate existing spec files (e.g. OpenSpec `openspec/specs/`) into `.specs/capabilities/`; (3) whenever a file under `.specs/capabilities/` is created or edited — every edit there must pass this skill's `scripts/capabilities.py check`. Triggers: "sync capabilities", "atualiza capacidades", "capability sync", "migrate specs to capabilities", a Verifier PASS verdict, or any question about what the system's current behavioral contract guarantees.
metadata:
  version: 0.1.0
---

# Capability Sync

Feature specs freeze: `.specs/features/X/spec.md` describes one change and never moves again. Nothing merges those deltas into a picture of what the system does **today**. Capabilities are that picture — one file per durable domain area, updated every time a feature's verified behavior lands. They are what lets a Verifier check that a new feature didn't break an old guarantee ("regression anchoring"), and what future Specify/Design phases read as ground truth.

Two rules follow from that purpose:

- **Only verified behavior enters.** The input is a feature's verification evidence — `validation.md`'s evidence table in tlc-spec-driven — not its intentions. If a criterion didn't pass, it doesn't sync.
- **The file is the current truth, not a changelog.** Changed behavior edits the requirement in place. Git history is the changelog.

## The format (owned by this skill)

One capability per file at `.specs/capabilities/<name>.md`. The validator enforces exactly this structure:

```markdown
# <name>                      <- H1 equals the filename stem; filename is kebab-case

## Purpose

1–3 sentences: what area of the system this capability covers.

## Requirements

### Requirement: Short name
Normative statement using SHALL / SHALL NOT / MUST / MUST NOT.

#### Scenario: Short name
- **WHEN** a concrete situation occurs
- **THEN** the observable outcome the system guarantees
```

Every capability has ≥1 requirement; every requirement has ≥1 scenario with WHEN and THEN. Requirement names are unique per file; scenario names unique per requirement. Content stays in the project's language — the repo's agent guidance (`AGENTS.md` / `CLAUDE.md`) defines that policy and its standing exceptions (e.g. regulatory terms that are never translated, or domain identifiers quoted from the code keeping their original names). The structural keywords (Requirement, Scenario, SHALL, WHEN, THEN) are always English. Capability text uses the canonical terms from `CONTEXT.md` when the repo keeps that glossary.

Capability names are **domain nouns** (`declaracao-asycuda`, `rateio-frete-seguro`), never feature slugs — a feature touches capabilities; it is not one.

## Sync process (after the feature's verification passes)

1. Collect what was verified.
   - **tlc-spec-driven:** read the feature's `spec.md` and `validation.md`; from the evidence table, collect the requirements/criteria that PASSed.

   Anything that failed, was skipped, or lacks evidence stays out.
2. Run `python3 <skill-dir>/scripts/capabilities.py list` to see the existing capabilities. Map each verified requirement to one: an existing file when the behavior belongs to an area that already has one, a new file when a genuinely new domain area appeared. When in doubt, extend an existing capability — fragmentation is the failure mode.
3. Merge, preserving the "current truth" rule:
   - **New behavior** → add a `### Requirement:` (or a new `#### Scenario:` under an existing requirement it refines).
   - **Changed behavior** → rewrite the affected requirement/scenario text in place.
   - **Removed behavior** → delete the requirement only when the feature explicitly removed it from the product. Never drop requirements just because this feature didn't touch them.
4. Gate: `python3 <skill-dir>/scripts/capabilities.py check` must exit 0. Fix violations and re-run — do not hand-wave past the validator; drift that survives the gate becomes silent.
5. Leave committing to the calling workflow (tlc execute flow, Archon node, or the user). This skill edits files; it does not run git.

## Migration mode

To bring an existing spec corpus (e.g. OpenSpec `openspec/specs/<name>/spec.md`) into `.specs/capabilities/`:

1. `python3 <skill-dir>/scripts/capabilities.py init` (creates the directory).
2. One source spec → one `<name>.md`, content verbatim where it already matches the format; adjust only structure (H1 = filename stem, `## Purpose`, `## Requirements`, heading levels).
3. Run `check` until it exits 0. Do not "improve" requirement wording during migration — behavior changes are features, not migrations.

## Validator

```bash
python3 <skill-dir>/scripts/capabilities.py check  # structure gate: exit 0 ok, 2 violations (file:line messages)
python3 <skill-dir>/scripts/capabilities.py list   # capabilities with requirement/scenario counts
python3 <skill-dir>/scripts/capabilities.py init   # create .specs/capabilities/
```

`<skill-dir>` is the directory that contains this `SKILL.md`. The capability paths are relative to the project root — run from there, or pass `--root`. Stdlib-only, same design language as tlc-spec-driven's `scripts/lessons.py`.
