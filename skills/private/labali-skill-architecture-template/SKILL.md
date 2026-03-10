---
name: labali-skill-architecture-template
description: Reusable architecture preference template for building robust skills with layered policy-strategy-execution design, semantic interaction priorities, bounded self-healing, and business-state verification.
---

# labali-skill-architecture-template

Use this skill as a reusable architecture policy when creating or refactoring complex skills.

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
