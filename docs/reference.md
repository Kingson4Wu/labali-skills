# Reference: Architecture and Terminology

Reference this document for concept definitions and terminology.

## Core Architecture Layers

- **Agent layer**: task orchestration and skill selection.
- **Skill layer**: capability package (`SKILL.md`, `agents/openai.yaml`, resources, tests).
- **Prompt layer**: behavior strategy and output constraints (modular and versioned).
- **MCP/Tool layer**: external capabilities (files, search, database, APIs).

Responsibility boundary: Agent decides, Skill executes, Prompt constrains, Tools provide capabilities.

## Terminology Glossary

- **Skill**: the capability package folder (`SKILL.md`, resources, tests).
- **Policy layer**: semantic intent and boundaries (`SKILL.md` body).
- **Strategy layer**: workflow reasoning and fallback guidance (`references/`).
- **Execution layer**: runnable implementation assets (`scripts/`).
- **Deterministic trajectory script**: fixed replay-oriented flow with minimal runtime inference.
- **Policy executor / strategy cache script**: structured flow with bounded semantic decision-making and fallback.
- **Semantic action**: interaction anchored by visible text, labels, and roles rather than brittle DOM paths.
- **Business-state verification**: success check based on final product state (e.g., `Published`/`Draft` list outcome), not just action completion.
