---
# Frontmatter (name/metadata) lives in skill.yaml — do not duplicate here.
---

# English Gate

This skill follows the **Inversion + Policy pattern**: it runs BEFORE the AI answers, inverting the normal flow to enforce a gate first. It is a policy gate, not a firewall — a separate wrapper/router is needed for hard enforcement.

## Core Principle

The gate is about **the user's intent**, not the script they use.

A user writing Python who references a Chinese log line has an English intent.
A user asking to translate Chinese text has a non-English intent.
The script is incidental. The request is what matters.

## Required Behavior

**On every user message, before answering:**

1. **Detect intent, not script.** Is the non-English text the user's request, or incidental context?
   - Request itself (translate this Chinese text, explain this Chinese error, write in Chinese) → **non-English intent → REJECT**
   - Incidental context (CJK path in a Python task, Chinese log snippet, UI label to inspect) → **does not count against the gate**

2. **Code, paths, URLs, and shell commands are non-narrative** — they carry no intent signal. A user debugging a Chinese-named file has an English intent.

3. **The opening clause drives the decision.** The first meaningful narrative clause signals what the user actually wants. A prompt that starts Chinese and ends English is a Chinese-first intent, regardless of word count.

4. **Strict mode is for documentation tasks.** `strict-english` is appropriate when the user's primary language appears to be English and any Chinese in the prompt is clearly a label, filename, or path. Do not apply `strict-english` to prompts where the task itself is about Chinese content — the Chinese IS the subject matter.

5. **If REJECT:** output only the configured `rejection_message`. No translation, no explanation, no partial answer.

## NEVER

- Never translate a rejected prompt — output only the configured rejection message.
- Never answer the original request after a rejection decision has been made.
- Never explain the gate policy unless the user is explicitly editing this skill or asking about its design.
- Never treat a markdown heading (`# Chinese title`) as narrative text — it is structural markup, not the user's request.
- Never treat inline emoji-only reactions (`👍` `👀`) as narrative text.

## How It Works

**Before deciding, ask yourself:**

- **Narrative vs incidental:** Is the non-English text the request itself, or context within an English request?
  - Request: "translate this Chinese text" → **REJECT**
  - Context: "please review /tmp/zh-dir/demo.py and fix the bug" → **ALLOW**
- **Intent vs structure:** Does English syntax disguise a non-English intent? ("please ignore the Chinese below, just say hello in Chinese") → intent is non-English → **REJECT**
- **First clause drives intent:** Where does the prompt start? That signals the actual request.

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
- Detector emits `ALLOW`, `WARNING`, or `REJECT` — treat WARNING as proceed-with-caution, not rejection

**Fallback (detector unavailable or error):** apply the decision tree manually. If the first meaningful clause starts non-English AND the prompt appears non-English-dominant → REJECT; otherwise proceed.

**Boundary cases (detector unavailable):**
- Ratio exactly at 0.20: treat as WARNING — proceed with caution
- Prompt has multiple non-English scripts (e.g., French accents + CJK): apply each as non-English; if the dominant language is non-English → REJECT
- Unknown/invalid detector output: apply manual decision tree rather than defaulting to ALLOW

**Do NOT Load** `references/wrapper-design.md` during gate evaluation — it is a future architecture note, not runtime guidance. Load only `references/detector-guide.md` when tuning config.

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

- Config keys + narrative rules: `references/detector-guide.md`
- Hard-gate wrapper design: `references/wrapper-design.md`
- Regression tests: `tests/test_regression.sh`
