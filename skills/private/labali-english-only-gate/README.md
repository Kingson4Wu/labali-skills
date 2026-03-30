# labali-english-only-gate

A policy gate skill that enforces English-only or English-dominant interaction for AI agent tasks. Rejects Chinese-first or non-English prompts with a fixed refusal message.

## Quick Start

**1.** The skill activates automatically when a prompt arrives — no manual setup needed.

**2.** To test the detector directly:
```bash
python3 scripts/detect_language_policy.py --text "Please refactor this function."
```

**3.** To customize the policy, create `policy.override.json` in the skill root.

## Configuration

Create `policy.override.json` in the installed skill directory:

```json
{
  "mode": "english-dominant",
  "max_non_english_ratio": 0.2,
  "allow_mixed_input": true,
  "allow_cjk_in_code_or_paths": true,
  "prefer_english_leading_narrative": true,
  "ignore_short_cjk_fragments_under": 6,
  "rejection_message": "Please ask your question in English only."
}
```

See `references/detector-guide.md` for full config key documentation.

## Debug Mode

Use `--debug` to trace every sanitization and counting step:

```bash
python3 scripts/detect_language_policy.py \
  --text $'# 关于重构\nPlease refactor this function.' \
  --debug
```

Debug output goes to stderr. Useful for verifying why a borderline case was decided a certain way.

## Common Gotchas

- **CJK in code is fine** — the detector ignores CJK inside fenced code blocks, inline code, paths, and URLs. Put problematic CJK in code fences.

- **First clause matters** — with `prefer_english_leading_narrative: true` (the default), a Chinese-first clause triggers REJECT even if the rest is mostly English.

- **The `--config` flag overrides everything** — pass `--config /path/to/custom.json` to test a specific config without modifying the skill.

- **WARNING is not a rejection** — when the ratio is within 0.03 of the threshold, the detector emits `WARNING` instead of `ALLOW`. This is a caution signal, not a block.

- **Markdown is sanitized** — fenced code blocks, inline code, headings, and link text are stripped before ratio counting. Markdown-aware mode is the default.

## Running Tests

```bash
# Run all regression cases
bash tests/test_regression.sh

# Run coverage check (shows branch coverage + all case results)
python3 tests/coverage_check.py
```

## Components

| File | Purpose |
|------|---------|
| `scripts/detect_language_policy.py` | Deterministic language detector (CLI) |
| `references/detector-guide.md` | Config keys, behavior notes, examples |
| `references/default-policy.json` | Default config template |
| `references/known-limitations.md` | Known failure modes |
| `references/wrapper-design.md` | Future hard-gate architecture (design note) |
| `tests/test_regression.sh` | Regression test suite |
| `tests/coverage_check.py` | Branch coverage checker |
