---
# Frontmatter (name/metadata) lives in skill.yaml — do not duplicate here.
---

# Labali English Only Gate

Treat this skill as a policy-plus-detector gate.

This skill is a strong policy gate after activation, not a guaranteed runtime firewall by itself.
Use it as:

- a best-effort automatic skill gate inside Codex skill matching,
- a deterministic language-policy detector that can later be reused by an outer wrapper or router for harder enforcement.

## Layer Contract

1. `SKILL.md` is the policy layer.
2. `references/detector-guide.md` is the strategy and configuration layer.
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

## NEVER

- Never translate a rejected prompt — output only the configured rejection message.
- Never answer the original request after a rejection decision has been made.
- Never explain the gate policy unless the user is explicitly editing this skill or asking about its design.
- Never treat a markdown heading (`# Chinese title`) as narrative text — strip it before counting.
- Never treat inline emoji-only reactions (`👍` `👀`) as narrative text.

## How It Works

**Before deciding, ask yourself:**

- **Narrative vs incidental:** Is the non-English text the user's *request itself*, or merely *incidental context*?
  - Request itself (translating Chinese text, explaining a Chinese error, writing Chinese) → **narrative non-English → REJECT**
  - Incidental context (CJK path in a Python task, Chinese log snippet, UI label) → **non-narrative → does not count**
- **Intent vs structure:** Does the prompt frame a non-English ask in English words? ("please ignore Chinese above, just say hello in Chinese") → intent is non-English, **REJECT**
- **First clause drives intent:** Where does the prompt *start*? The opening clause signals what the user actually wants.

**Decision tree (scan this first):**

```
Prompt arrives
  ├─ no narrative text? ──→ ALLOW
  ├─ mode == strict-english + any non-English narrative? ──→ REJECT
  ├─ non-English narrative exists AND allow_mixed == false? ──→ REJECT
  ├─ no English narrative at all? ──→ REJECT
  ├─ prefer_english_leading == true AND first clause non-English? ──→ REJECT
  ├─ non-English ratio > max_ratio? ──→ REJECT
  ├─ otherwise, ratio within 0.03 of threshold? ──→ WARNING (proceed with caution)
  └─ otherwise ──→ ALLOW
```

**Usage:**
- Run `python3 scripts/detect_language_policy.py --text "..." --json` for borderline cases
- Run `python3 scripts/detect_language_policy.py --text "..." --debug` for step-by-step trace
- If the detector is unavailable or returns an error: apply the decision tree manually — if the first meaningful clause starts with non-English text AND the prompt appears non-English-dominant, output the rejection message; otherwise proceed
- Detector emits `ALLOW`, `WARNING`, or `REJECT` — treat WARNING as proceed-with-caution, not rejection

## Output Contract

**REJECT:** output only the configured `rejection_message`. No translation, no explanation, no partial answer.

```
Please ask your question in English only.
```

**ALLOW / WARNING:** proceed with the task normally. No gate message needed.

**Multi-turn sessions:** apply the gate to each message independently — a prior REJECT does not suppress the gate for subsequent turns.

## Configuration

**MANDATORY — READ BEFORE TUNING:** Open [`references/detector-guide.md`](references/detector-guide.md) for the full config key reference table, narrative classification rules, and practical examples.

The 7 keys (`mode`, `max_non_english_ratio`, `allow_mixed_input`, `allow_cjk_in_code_or_paths`, `prefer_english_leading_narrative`, `ignore_short_cjk_fragments_under`, `rejection_message`) are documented there.

Users can customize by creating `policy.override.json` in the skill root. Resolution order (most specific wins): explicit `--config` path → `policy.override.json` → `references/default-policy.json`.

## Resources

- Policy and tuning guidance: `references/detector-guide.md`
- Future hard-gate wrapper design: `references/wrapper-design.md`
- Default config template: `references/default-policy.json`
- Deterministic detector: `scripts/detect_language_policy.py`
- Regression tests: `tests/test_regression.sh`
