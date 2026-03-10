# Design Boundaries

## 1) Goal

Convert a task intent into a deterministic executable script specification.
The output should be immediately implementable and should not require runtime reasoning.

## 2) Minimal Input Assumption

When user input is short, assume:
- intent is the user sentence,
- runtime constraints default to no-reasoning and fail-fast,
- unknown details become explicit placeholders in Parameters.

## 3) Deterministic Principles

1. Fixed order: steps run in predefined sequence.
2. Fixed checks: each step has assertion and failure code.
3. Fixed branches: only explicit branches, no candidate exploration.
4. Fixed output: return structured result `{ status, data, error }`.

## 4) Practicality Rules

- Prefer concise script-ready specs over long methodology.
- Avoid coupling to one specific source skill; intent can come from multi-skill or dynamic flows.
- If information is insufficient, output strict placeholders rather than adding runtime reasoning.

## 5) Failure Policy

- Missing required precondition -> stop immediately.
- Assertion failed -> stop immediately.
- No hidden retries based on semantic guess.
