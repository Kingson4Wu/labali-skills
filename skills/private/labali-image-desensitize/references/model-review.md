# Model Review (No API, In-Agent)

Use this guide after deterministic metadata scan.

## Input

- `MODEL_REVIEW_SUMMARY` line from script output.
- JSON block between:
  - `MODEL_REVIEW_JSON_BEGIN`
  - `MODEL_REVIEW_JSON_END`

## Decision Rules

Return one final level:

- `PASS`
- `REVIEW_REQUIRED`
- `BLOCK`

Apply rules:

1. Return `BLOCK` when direct personal identifiers are present in metadata values:
   - email, phone, address, exact geo coordinates, device serial/identifier.
2. Return `REVIEW_REQUIRED` when only suspicious metadata keys exist but values are unclear.
3. Return `PASS` only when no sensitive key/value evidence is found.

## Output Format

Use exactly this section format in final response:

```text
Sensitive Metadata Verdict: <PASS|REVIEW_REQUIRED|BLOCK>
Reason:
- <short reason 1>
- <short reason 2>
Evidence:
- <metadata key/value excerpt>
```

Keep evidence minimal and avoid exposing unnecessary full raw values.

## Strict Mode Interaction

- `--strict` belongs to deterministic gate, not semantic model inference.
- In strict mode, any deterministic suspicious metadata candidate should fail the run first.
- Still provide semantic verdict for human review context when output is available.
