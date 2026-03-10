# Architecture Preferences for New Skills

## 1) Layered Boundaries

### Policy Layer (`SKILL.md`)
- Scope: intent, constraints, success criteria, and immutable boundaries.
- Should remain stable across execution rewrites.
- Must avoid brittle runtime details.

### Strategy Layer (`references/*.md`)
- Scope: workflow stage map, decision points, fallback policy, and quality gates.
- Captures recovery logic and known variants.
- Should stay implementation-light and decision-oriented.

### Execution Layer (`scripts/*`)
- Scope: runnable implementation and runtime glue.
- Scripts are replaceable assets, not the source of truth.
- Preferred style: policy executor (stable skeleton + bounded semantic decisions).

## 2) Runtime Pattern

1. Try deterministic fast path (optional acceleration).
2. If fast path fails, auto-downgrade to policy executor in the same run.
3. If policy path fails, apply bounded repair-and-retry loop.
4. Validate terminal business state before returning success.
5. Persist failure context for iterative optimization.

## 3) Interaction Priority

1. Role + accessible name.
2. Visible text candidates.
3. Label/placeholder-based field actions.
4. Bounded DOM/selector fallback.

Never depend on coordinates, unstable indexes, or brittle one-shot selectors as primary strategy.

## 4) Self-Healing Standards

- Trigger recovery on missing controls, stage mismatch, or verification failure.
- Recovery order:
  1. Re-snapshot and re-detect stage.
  2. Retry semantic alternatives.
  3. Apply narrow bounded fallback.
  4. Re-run terminal verification.
- Every retry must have finite bounds and actionable error outputs.

## 5) Correctness Standards

- Action success is not task success.
- Define explicit business-state checks at terminal stage.
- Do not return success unless all required checks pass.

## 6) Input and Guardrails

- Validate required inputs early.
- Validate file readability and typed fields before execution.
- Reject ambiguous or invalid inputs with clear error messages.

## 7) Observability

- Log stage transitions and major decision branches.
- On failure, capture screenshot/context and concise diagnostics.
- Keep logs useful for replay, repair, and deterministic optimization.
