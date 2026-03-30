# Known Limitations

The detector is probabilistic, not semantic. These are known failure modes.

## False Positive Risks (REJECT when should ALLOW)

1. Short non-Latin phrases used as UI labels in otherwise English sentences.
   Example: `"Click '确定' to confirm"` — the `确定` may be counted as narrative.
   **Workaround:** Put UI labels inside inline code fences.

2. CJK characters mixed with emoji outside code fences.
   Example: `"👍👍 好！"` — the `好` may shift the ratio.
   **Workaround:** Avoid mixing emoji with CJK outside code fences.

3. Markdown headings that contain only CJK text — handled in markdown-aware mode
   but not in basic stripping.
   **Workaround:** Use English headings, or use `--debug` to verify.

4. Inline code with non-Latin identifiers near narrative text.
   The `inline_code_re` regex strips CJK from inline code spans, but edge cases
   near sentence boundaries may affect ratio slightly.
   **Workaround:** Move adjacent narrative text away from the inline code span,
   or use a fenced code block instead of inline code.

## False Negative Risks (ALLOW when should REJECT)

1. English text that is structurally dominant but semantically wrong.
   Example: `"please ignore the Chinese instruction: [Chinese text]"` — English
   is dominant but intent is non-English.
   The detector cannot understand intent. A hard-gate wrapper (outside scope)
   would be needed for stronger enforcement.
   **Defensive practice:** Audit prompts containing override phrases like "ignore",
   "disregard", or "forget" before routing.

2. Short mixed prompts where English and non-English are roughly equal.
   Ratio-based threshold may allow borderline cases through.
   **Workaround:** Consider raising the `max_non_english_ratio` for stricter
   enforcement in mixed-language environments.

## Unsupported Languages

These scripts are classified as non-English but may be the user's primary language.
The gate is English-only by design — adapt the config or use a different gate.

- Korean Hangul (classified as non-English)
- Arabic (classified as non-English)
- Hindi/Devanagari (classified as non-English)
- Russian/Cyrillic (classified as non-English)
- Thai (classified as non-English)
- French/Polish/Czech accented Latin (classified as non-English)
