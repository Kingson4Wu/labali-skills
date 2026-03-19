# English Gate Policy

## Goal

Enforce an English-first interaction policy while still allowing practical mixed-language prompts when English is clearly the main language.

This skill should be described honestly as a strong policy gate, not as a guaranteed platform-level firewall.
If a user needs truly mandatory enforcement, place an outer wrapper/router in front of Codex and reuse this skill's detector as the decision engine.
See `references/wrapper-design.md` for the future hard-gate architecture.

## Default Policy

Default mode is `english-dominant`.

Behavior:

- Allow prompts whose natural-language body is mostly English.
- Allow a small amount of Chinese or other non-English text when it acts as a clarification, quote, label, or short supplement.
- Prefer prompts whose first meaningful narrative clause is English.
- Reject prompts whose natural-language body is primarily Chinese or clearly non-English.
- Ignore Chinese inside code, paths, URLs, file names, and command arguments when `allow_cjk_in_code_or_paths` is enabled.

## Strict Policy

Mode `strict-english` is narrower:

- Reject narrative Chinese or non-English text unless it appears only inside code/path-like fragments that are explicitly tolerated.
- Use a much smaller `max_non_english_ratio`.

## Customization

Installed users can customize the gate in two ways:

- create `policy.override.json` in the skill root and change the values there,
- run the detector with `--config /path/to/custom.json`.

Resolution order:

1. explicit `--config`
2. `policy.override.json`
3. `references/default-policy.json`

## Config Keys

### `mode`

- `english-dominant`: practical default
- `strict-english`: tighter rejection policy

### `max_non_english_ratio`

Ratio of non-English narrative letters to all counted narrative letters.

Suggested values:

- `0.20` for practical English-dominant use
- `0.02` to `0.05` for strict mode

### `allow_mixed_input`

- `true`: allow English-majority prompts with a small amount of Chinese
- `false`: reject whenever narrative non-English text appears beyond tolerated fragments

### `allow_cjk_in_code_or_paths`

- `true`: ignore Chinese found inside code fences, inline code, commands, paths, URLs, filenames, or extension-like tokens
- `false`: count all Chinese text

### `prefer_english_leading_narrative`

- `true`: treat the first meaningful narrative clause as a strong signal
- `false`: use aggregate counts only

Recommended default: `true`

### `ignore_short_cjk_fragments_under`

Ignore very short narrative Chinese fragments under this length threshold during ratio counting.

Suggested values:

- `6` to tolerate tiny parenthetical clarifications
- `0` to disable this tolerance

### `rejection_message`

The exact message to output on rejection.

Default:

`Please ask your question in English only.`

## Heuristic Guidance

Treat the following as narrative text unless there is strong evidence otherwise:

- full sentences,
- explanatory clauses,
- free-form questions,
- instruction paragraphs.

Practical decision order:

1. Ignore code/path-like fragments when configured.
2. Detect the first meaningful narrative clause.
3. If that first clause starts with Chinese or other non-English narrative text and English-leading preference is enabled, reject early.
4. Otherwise use aggregate English vs non-English narrative counts.
5. Use ratio thresholds only for boundary cases.

Treat the following as non-narrative when `allow_cjk_in_code_or_paths` is enabled:

- fenced code blocks,
- inline code spans,
- shell commands,
- file system paths,
- URLs,
- filenames,
- extension-like tokens,
- single labels attached to technical artifacts.

## Practical Interpretation

- `Can you refactor this function? [zh: variable name unclear]` -> allow
- `Please help fix this bug, [zh: also explain why this error]` -> allow
- `[zh: Please refactor this function and explain why]` -> reject
- `[zh: Please look at this bug first], then refactor the function` -> reject
- `Please edit /tmp/[zh-dirname]/demo.py and keep comments in English.` -> allow
- `Please check /tmp/[zh-dirname]/demo.py and rename the function.` -> allow
- `Please review this command: grep "[zh-keyword]" app.log` -> allow
- `[zh: Please handle /tmp/demo.py]` -> reject
