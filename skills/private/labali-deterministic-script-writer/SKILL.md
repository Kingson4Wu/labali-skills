---
name: labali-deterministic-script-writer
description: Convert a user task into a deterministic no-reasoning script specification that can be executed directly without repeated runtime reasoning.
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

## Input Mode (Minimal)

If the user provides only one sentence, it is enough. Assume:
1. `intent`: the task goal in that sentence.
2. `constraints`: runtime must avoid repeated reasoning.
3. missing details should be represented as explicit parameters/placeholders in output.

## Output Contract (Always)

Return exactly these sections:
1. `Preconditions`
2. `Parameters`
3. `Deterministic Steps`
4. `Step Assertions`
5. `Fail-Fast Rules`
6. `Script Skeleton` (runnable shape with `status/data/error`)

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
