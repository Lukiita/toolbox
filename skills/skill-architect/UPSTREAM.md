# Upstream - skill-architect

- **Repo**: https://github.com/tech-leads-club/agent-skills (Tech Leads Club; CC-BY-4.0; author Felipe Rodrigues), published at https://agent-skills.techleads.club/skills/skill-architect/
- **Path there**: `packages/skills-catalog/skills/(creation)/skill-architect/`
- **Vendored base here**: **1.0.0**, copied verbatim at upstream commit `d0c46bfad8b1a428035beb91c1ee70a6d7356536` (2026-11-22), imported 2026-11-22. The five upstream files are byte for byte that commit, file modes included; this `UPSTREAM.md` is the only file added.
- **No vendor branch yet**: with no local delta, that commit is the base. A `vendor/skill-architect` branch starts the day a local change does, as for the other vendored skills.

## Local delta

None.

## How it sits with the neighbours

- **`writing-for-agents`** is the reference for _how to write_ any document an agent reads (context pointers, the two loads, leading words). `skill-architect` is the _process_ for building a new skill from scratch: discovery, architecture, craft, validate, deliver. While crafting, the writing levers come from `writing-for-agents`.
- The skills it points to by name and this toolbox does not ship - `skill-creator`, `subagent-creator`, `create-technical-design-doc` - are reached by name, not by path, so no install brings them along. `skill-creator` is available as a Claude Code plugin skill.
- `scripts/validate_skill.py` runs on stdlib alone; PyYAML is optional (a fallback parser covers the frontmatter subset skills use).
