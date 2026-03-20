---
name: labali-deterministic-script-writer
description: Convert a user task into a deterministic no-reasoning script specification that can be executed directly without repeated runtime reasoning.
license: MIT
compatibility: AI agent environment only; no system dependencies.
metadata:
  pattern: inversion+generator
  interaction: multi-turn
  output-format: markdown
---

# labali-deterministic-script-writer

Use this skill when the user says things like:
- "Freeze my task into a script."
- "Make this executable directly next time."
- "No repeated reasoning, just run."

This is a prompt-and-spec skill. It defines deterministic script specs clearly and simply.

## Runtime Inputs

- `intent`: required task goal from user request.
- `environment`: optional runtime context (OS, toolchain, auth state, paths).
- `constraints`: optional hard limits (timeouts, no-network, safety restrictions).

## Execution Contract

### Phase 1 — Inversion (clarify before generating)

DO NOT proceed to Phase 2 until all required inputs are confirmed.

If `environment` or `constraints` are missing and cannot be inferred:
- Ask the user for the target OS/toolchain and any hard limits.
- If the user provides only one sentence, treat it as `intent` and represent missing details as explicit required placeholders in the output — do not block on asking.

### Phase 2 — Generator (produce the spec)

Execute in fixed order:

1. Load `templates/script-spec.md` — use it as the canonical output scaffold.
2. Fill all 6 required sections from the template:
   - `Preconditions`
   - `Parameters`
   - `Deterministic Steps`
   - `Step Assertions`
   - `Fail-Fast Rules`
   - `Script Skeleton` (runnable shape with `status/data/error`)
3. Make all required parameters explicit (or mark as required placeholders).
4. Ensure deterministic steps are executable in fixed order with no runtime reasoning loops.
5. Make assertions and fail-fast conditions concrete and testable.
6. Output the complete spec.

## Success Criteria

A response is complete only when:

1. All required parameters are explicit (or marked required placeholders).
2. Deterministic steps are executable in fixed order.
3. Assertions and fail-fast conditions are concrete and testable.
4. Script skeleton can run without requiring additional reasoning loops.

## Hard Rules

1. Runtime no-reasoning: no model calls, no semantic candidate retries.
2. No guesswork loops: if required state is missing, fail immediately with explicit error code.
3. Deterministic first: fixed order, fixed checks, explicit branch conditions only.
4. Keep it executable: do not output abstract theory without script skeleton.

## Resources

- Working style and design boundaries: `references/architecture.md`
- Copy-ready prompt for this skill: `references/prompt-template.md`
