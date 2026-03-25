# Reference: Architecture and Terminology

Reference this document for concept definitions and terminology used across skills and documentation.

## Core Architecture Layers

- **Agent layer**: task orchestration and skill selection.
- **Skill layer**: capability package (`SKILL.md`, resources, scripts, tests).
- **Prompt layer**: behavior strategy and output constraints (modular and versioned).
- **MCP/Tool layer**: external capabilities (files, search, database, APIs).

Responsibility boundary: Agent decides, Skill executes, Prompt constrains, Tools provide capabilities.

## Within-Skill Layers

| Layer | Location | Purpose |
|-------|----------|---------|
| **Policy** | `SKILL.md` body | Semantic intent, constraints, success criteria — stable across UI changes |
| **Strategy** | `references/` | Workflow reasoning, UI hints, fallback guidance — updated when UI changes |
| **Execution** | `scripts/` | Runnable implementation — replaced when approach changes |

## Terminology Glossary

- **Skill**: the capability package folder (`SKILL.md`, optional resources, scripts, tests).
- **Policy layer**: semantic intent and boundaries (`SKILL.md` body). Must use functional language — no UI strings, selectors, or DOM paths.
- **Strategy layer**: workflow reasoning and fallback guidance (`references/`). May include observed UI patterns but must mark them as observations, not requirements.
- **Execution layer**: runnable implementation assets (`scripts/`). Replaced when approach changes; policy layer remains stable.
- **Deterministic cache**: fast-path trajectory replay (`scripts/cache/deterministic.ts`) — pre-recorded interaction sequence for known-good UI state.
- **Policy executor**: semantic fallback (`executor.ts`) — re-discovers the UI path when the deterministic cache fails.
- **Pending-regen marker**: `pending-regen.json` written when deterministic cache fails but policy executor succeeds. Triggers cache regeneration at the start of the next run, non-blocking.
- **Semantic action**: interaction anchored by role + accessible name, visible text, or label/placeholder — not brittle DOM selectors or coordinates.
- **Business-state verification**: success check based on observable product state (e.g., episode in `Published` list), not on action completion or UI confirmation messages.
- **Startup check**: mandatory check at the beginning of every browser skill run — detects `pending-regen.json` and repairs the deterministic cache before proceeding.
- **Knowledge delta**: the gap between what a skill provides and what the AI model already knows. A skill's value is measured by this delta — only expert-exclusive knowledge earns its token cost.
