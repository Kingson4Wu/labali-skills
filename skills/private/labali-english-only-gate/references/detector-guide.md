# Detector Guide

## Config Keys

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `mode` | `english-dominant`, `strict-english` | `english-dominant` | Rejection aggressiveness |
| `max_non_english_ratio` | float 0.0–1.0 | `0.20` | Non-English letter ratio threshold |
| `allow_mixed_input` | boolean | `true` | Allow any non-English narrative text |
| `allow_cjk_in_code_or_paths` | boolean | `true` | Ignore CJK in code/fences/paths/URLs |
| `prefer_english_leading_narrative` | boolean | `true` | Reject if first clause is non-English |
| `ignore_short_cjk_fragments_under` | int ≥ 0 | `6` | Skip short CJK clauses in ratio math |
| `rejection_message` | string | (see default-policy.json) | Message to output on rejection |

## What Counts as Narrative

**Narrative text** (counts against the ratio):
- Full sentences and explanatory clauses
- Free-form questions and instruction paragraphs
- Clause fragments not inside code/path structures

**Non-narrative** (ignored when `allow_cjk_in_code_or_paths: true`):
- Fenced code blocks (` ``` `)
- Inline code spans (`` `code` ``)
- Markdown headings (`# heading`)
- Markdown link text (`[text](url)`)
- File system paths (`/tmp/dir/file.py`)
- URLs (`https://example.com`)
- Shell commands and arguments
- Filenames and extension-like tokens

## Practical Examples

| Prompt | Result | Why |
|--------|--------|-----|
| `Can you refactor this function? [zh: variable name unclear]` | ALLOW | English-dominant, small CJK fragment |
| `Please help fix this bug, [zh: also explain why this error]` | ALLOW | English dominant, short CJK supplement |
| `[zh: Please refactor this function and explain why]` | REJECT | Chinese-dominant |
| `[zh: Please look at this bug first], then refactor` | REJECT | First clause is non-English |
| `# 关于系统说明`<br>`Please edit /tmp/zh-dir/demo.py` | ALLOW | Markdown heading stripped; CJK path ignored |
| `Please review: grep "[zh-keyword]" app.log` | ALLOW | Command argument, non-narrative |

## Config Resolution Order

1. Explicit `--config` path (wrapper usage)
2. `policy.override.json` in skill root (user customization)
3. `references/default-policy.json` (defaults)

## Output Shape

```json
{
  "status": "ALLOW|WARNING|REJECT",
  "mode": "english-dominant",
  "english_count": 42,
  "non_english_count": 3,
  "cjk_count": 3,
  "counted_letters": 45,
  "non_english_ratio": 0.0667,
  "script_breakdown": { "cjk": 3, "hangul": 0, ... },
  "first_clause": "Can you refactor...",
  "first_clause_language": "english",
  "first_clause_leading": "english",
  "reason": "...",
  "rejection_message": "..."
}
```
