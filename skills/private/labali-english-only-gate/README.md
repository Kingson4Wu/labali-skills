# labali-english-only-gate

A policy gate skill that enforces English-only or English-dominant interaction for AI agent tasks. Rejects prompts where non-English narrative text is dominant, and outputs a configured rejection message.

## What it does

- Inspects incoming prompts for language dominance before answering
- Defaults to `english-dominant` mode: allows English-majority prompts with small Chinese fragments
- Supports `strict-english` mode for stricter enforcement
- Outputs a fixed rejection message on rejection — does not translate or answer the original request
- Treats code, paths, URLs, and filenames as non-narrative (not counted against the language ratio)

## Configuration

Create `policy.override.json` in the installed skill directory to customize behavior:

```json
{
  "mode": "english-dominant",
  "max_non_english_ratio": 0.3,
  "rejection_message": "Please submit your request in English."
}
```

See `references/default-policy.json` for all available keys.

## Components

| File | Purpose |
|------|---------|
| `scripts/detect_language_policy.py` | Deterministic language detector (CLI) |
| `references/policy.md` | Policy model and tuning guidance |
| `references/default-policy.json` | Default config template |
| `tests/test_regression.sh` | Regression test suite |
