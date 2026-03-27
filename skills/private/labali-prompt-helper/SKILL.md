---
name: labali-prompt-helper
description: >-
  Personal prompt library assistant. Outputs high-quality reusable prompts
  (both ready-to-use and fill-in-the-blank template versions) for use in any
  AI tool. Use when the user wants a prompt for a task rather than doing the
  task directly. Trigger phrases: "/prompt", "give me a prompt", "write me a prompt",
  "I want to organize content", "I want to check logic", "I want to compress content",
  "I want to polish", "I want to rewrite".
license: MIT
---

# labali-prompt-helper

Output reusable prompts from a personal library. Never execute the prompt against content — only output it.

## Runtime Inputs

- User's keyword (via `/prompt <keyword>`) or natural language description of intent.

## Execution Contract

### Step 1 — Load the library

Read `assets/prompts.json` to load all prompt entries before doing anything else.

### Step 2 — Match

**Keyword mode** (input starts with `/prompt`):
- Extract the keyword after `/prompt`
- Find entries where any tag exactly matches or contains the keyword
- If multiple match, pick the one whose description best fits the keyword

**Natural language mode** (any other input):
- Semantically match the user's description against each entry's `description` and `tags`
- Pick the single best match

### Step 3 — Output

**If a match is found**, output in this exact format:

```
Scenario: <entry.description>

[Ready-to-Use]
<entry.query>

[Template (with placeholders)]
<entry.template>
```

**If no match is found**:
1. Generate a new prompt suited to the described intent, following the quality standards below
2. Output it in the same format (use a fitting description for Scenario)
3. Ask: "Save this entry to the library?"
4. If user confirms: append the new entry to `assets/prompts.json`. All five fields are required: `id` (unique kebab-case), `tags` (array of keywords), `description` (one-line summary), `query` (ready-to-use, ends with colon), `template` (query with `[placeholder]`).

User may also say "save this prompt: ..." at any time — write that prompt directly into `assets/prompts.json` as a new entry, deriving `id`, `tags`, and `description` from the content.

## Prompt Quality Standards

When generating a new prompt (no-match case), follow these principles:

- **State the operation explicitly**: what the AI should do (verify, restructure, compress, check, rewrite...)
- **State the output requirements explicitly**: format, structure, constraints
- **End `query` with a colon** so the user can paste content directly after it
- **`template` = `query` with `[placeholder]` replacing the variable content slot**
- Prefer direct, engineering-style language — no vague phrases like "please help me"
- Keep it self-contained: the prompt should work without any additional context

## NEVER

- Never execute the prompt against the user's content — only output the prompt text
- Never output only one version — always output both `query` and `template`
- Never omit any field when saving a new entry to `assets/prompts.json`
- Never add a "management" interface (listing, deleting entries) — direct JSON editing is the management path
