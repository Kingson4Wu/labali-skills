---
name: labali-english-only-gate
description: Enforce an English-only or English-dominant interaction gate for Codex tasks. Use when the user asks to accept English prompts only, reject Chinese-first or clearly non-English input, allow English-majority mixed input with small Chinese fragments, or require a fixed refusal message instead of answering the request. Trigger for Chinese characters, mixed Chinese-English prompts, multilingual prompts, language gate policies, or requests to require English-first interaction.
license: MIT
compatibility: AI agent environment only; no system dependencies.
---

# Labali English Only Gate

Treat this skill as a policy-plus-detector gate.

This skill is a strong policy gate after activation, not a guaranteed runtime firewall by itself.
Use it as:

- a best-effort automatic skill gate inside Codex skill matching,
- a deterministic language-policy detector that can later be reused by an outer wrapper or router for harder enforcement.

## Layer Contract

1. `SKILL.md` is the policy layer.
2. `references/policy.md` is the strategy and configuration layer.
3. `scripts/detect_language_policy.py` is the deterministic detector.

## Required Behavior

- Inspect the current user message before answering the actual request.
- Default policy is `english-dominant`:
  - allow English-majority prompts,
  - allow small Chinese fragments when they help clarify the request,
  - prefer prompts whose first narrative clause is English,
  - reject prompts where Chinese or other non-English narrative text is dominant.
- Support stricter policy through config:
  - `strict-english` rejects narrative Chinese/non-English text except tolerated path/code fragments.
- Treat code, shell commands, file paths, URLs, and filenames as non-narrative context when configured to ignore them.
- If the prompt is rejected, output exactly the configured rejection message and nothing else.
- Do not translate the request.
- Do not answer the original request after a rejection decision.
- Do not explain the policy unless the user is explicitly editing this skill or asking about the gate design itself.

## Execution Workflow

1. Read `references/policy.md` for the policy model and config keys.
2. Use `scripts/detect_language_policy.py` when the prompt contains mixed language or the boundary is unclear.
3. Apply the effective config:
   - use defaults from `references/default-policy.json`,
   - automatically prefer `policy.override.json` in the skill root when it exists,
   - optionally use an explicit `--config` path when a caller wants a different override file.
4. If detector result is `REJECT`, output the configured rejection message exactly.
5. If detector result is `ALLOW`, continue with the normal task.

## Output Contract

- Rejected prompt:
  - output only the configured rejection message.
- Allowed prompt:
  - do nothing special and continue normally.

## Configuration

The configurable keys are:

- `mode`
- `max_non_english_ratio`
- `allow_mixed_input`
- `allow_cjk_in_code_or_paths`
- `prefer_english_leading_narrative`
- `ignore_short_cjk_fragments_under`
- `rejection_message`

Use `references/default-policy.json` as the default config template.
Users who install the skill can customize behavior by creating or editing `policy.override.json` in the installed skill directory.

## Resources

- Policy and tuning guidance: `references/policy.md`
- Future hard-gate wrapper design: `references/wrapper-design.md`
- Default config template: `references/default-policy.json`
- Deterministic detector: `scripts/detect_language_policy.py`
- Regression tests: `tests/test_regression.sh`
