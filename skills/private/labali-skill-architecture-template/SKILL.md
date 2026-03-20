---
name: labali-skill-architecture-template
description: Reusable architecture preference template for building robust skills with layered policy-strategy-execution design, semantic interaction priorities, bounded self-healing, and business-state verification.
license: MIT
compatibility: AI agent environment only; no system dependencies.
metadata:
  pattern: inversion+generator
  interaction: multi-turn
---

# labali-skill-architecture-template

Use this skill as a reusable architecture policy when creating or refactoring complex skills.

## Runtime Inputs

- `target_skill`: skill name and location (public/private).
- `task_profile`: what the skill must do, risk level, and expected determinism.
- `constraints`: execution constraints (tooling, auth, runtime limits).

## Execution Contract

### Phase 1 — Inversion (gather before generating)

DO NOT proceed to Phase 2 until all required inputs are known.

Ask the user for any missing required inputs:

1. **target_skill** (required): skill name and whether it is public or private.
2. **task_profile** (required): what the skill must do, risk level, and expected determinism (e.g. browser automation, local CLI, AI-only).
3. **constraints** (optional): tooling limits, auth model, network restrictions, runtime limits.

If all inputs are present in the user's initial message, skip asking and proceed directly to Phase 2.

### Phase 2 — Generator (produce the scaffold)

Execute in fixed order:

1. Load `templates/skill-skeleton.md` — use it as the canonical scaffold template.
2. Fill the scaffold with the collected inputs:
   - Layer contract (policy / strategy / execution).
   - Required constraints and success criteria.
   - Resource file map.
   - Directory layout.
3. Apply the architecture baseline from the Layer Contract below.
4. Output the complete scaffold.

## Layer Contract

1. `SKILL.md` is the policy layer.
   - Define goals, constraints, success criteria, and boundaries.
   - Keep semantics stable and independent from brittle runtime details.
2. `references/architecture.md` is the strategy layer.
   - Define stage model, decision boundaries, fallback order, and quality gates.
3. `scripts/*` is the execution layer.
   - Scripts are replaceable execution assets.
   - Prefer policy executor architecture (stable orchestration skeleton + bounded semantic decisions).

## Execution Baseline

- Prefer a two-tier runtime:
  - deterministic fast path for speed,
  - policy baseline fallback for reliability.
- Deterministic mode is optional acceleration.
- Policy executor is mandatory baseline capability.

## Output Contract

When applying this template, always produce:

1. Layer mapping (`policy / strategy / execution`) with file placement.
2. Deterministic baseline workflow and bounded fallback rules.
3. Explicit business-state verification gates.
4. Regression-test expectations for behavior changes.

## Required Constraints

- Prioritize semantic interactions (role/name, text, labels, placeholders) over brittle selectors.
- Never define success by action completion only.
- Return success only after business-state verification passes.
- Keep recovery bounded: deterministic retry policy, no unbounded exploration loops.

## Success Criteria

A run is successful only when:

1. Required terminal business-state checks are all true.
2. Blocking required controls are resolved.
3. Verification passes independently of click/action logs.

## Resources

- Architecture preferences: `references/architecture.md`
- Prompt templates for new skills: `references/prompt-template.md`
