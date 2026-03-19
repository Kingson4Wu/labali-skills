# Skill Monorepo Development Guide

This document is the overall guide and source of truth for this repository. Detailed standards are split into focused documents under `docs/` — load only what is relevant to the current task.

`AGENTS.md` defines AI assistant execution behavior and references this document and `docs/`.

## Repository Structure

```text
.
├── skills/
│   ├── public/       # Reusable and shareable skills
│   └── private/      # Internal-only skills
├── scripts/          # Repo-level tooling (init, validate, check)
├── docs/             # Detailed standards (load per task)
├── .github/workflows/
├── DEVELOPMENT.md    # This file — overall guide
├── AGENTS.md         # AI execution contract
└── CLAUDE.md         # Claude Code entry point
```

## docs/ Index

| Document | When to load |
|----------|-------------|
| `docs/skill-authoring.md` | Creating or modifying any skill |
| `docs/browser-automation.md` | Working on a `browser` type skill |
| `docs/conventions.md` | Language policy, commit format, naming rules |
| `docs/workflow.md` | Installation, local commands, dev flow, CI |
| `docs/testing.md` | Writing or running skill tests |
| `docs/reference.md` | Architecture concepts and terminology glossary |

## Guiding Principles

- Skills are organized under `skills/public/` (shareable) and `skills/private/` (internal-only).
- Skill types (`browser`, `policy`, `cli`, `hybrid`) are reference models, not fixed labels — use them as a guide for structure decisions. See `docs/skill-authoring.md`.
- The three-layer model (Policy / Strategy / Execution) applies per type — not all layers are required for every skill.
- `agents/openai.yaml` and `README.md` are required for all skills.
- Dependency files (`package.json`, `requirements.txt`) live at the **skill root**, not inside `scripts/`.
- All files must be in English. Run `npm run check:chinese` to verify.
- `SKILL.md` uses semantic language only — no UI strings, CSS selectors, or XPath.
