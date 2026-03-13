# Wrapper And Router Design

## Purpose

This document is a future-facing design note.

It does not change the current skill behavior.
The current skill remains a best-effort in-skill policy gate.

Use this document later if you want a harder enforcement layer outside Codex skill matching.

## Why A Wrapper Exists

Skill matching is not a guaranteed firewall.

A wrapper or router can enforce language policy before the prompt reaches Codex:

1. receive the raw user input,
2. run the detector,
3. reject immediately when policy fails,
4. forward only allowed prompts to Codex.

## Recommended Architecture

### Option A: CLI Wrapper

Wrap the Codex command with a small launcher:

1. read stdin or the prompt argument,
2. call `scripts/detect_language_policy.py --json`,
3. if status is `REJECT`, print the configured rejection message and exit,
4. if status is `ALLOW`, invoke Codex normally.

This is the simplest path to a practical hard gate.

### Option B: IDE Or Agent Router

Place a router in front of the assistant:

1. intercept every user message,
2. run the detector,
3. short-circuit rejected prompts,
4. send only allowed prompts to the model.

This works better than a pure skill gate for long-lived chat sessions.

### Option C: API Middleware

If prompts come through an API service, enforce the gate in middleware:

1. evaluate the message before model dispatch,
2. reject or rewrite at the service boundary,
3. log the policy result for audit/debugging.

This is the strongest option when you own the full request pipeline.

## Stable Interface

The detector should remain stable enough for wrappers to call directly.

Expected command shape:

```bash
python3 scripts/detect_language_policy.py --text "..." --json
```

Expected JSON shape:

```json
{
  "status": "ALLOW",
  "mode": "english-dominant",
  "non_english_ratio": 0.08,
  "first_clause_language": "english",
  "reason": "English remains dominant and the non-English narrative ratio is within policy.",
  "rejection_message": "Please ask your question in English only."
}
```

Wrappers should depend on:

- `status`
- `reason`
- `rejection_message`

Other fields are helpful for debugging and tuning.

## Config Resolution

Wrapper code should preserve the same config order as the skill:

1. explicit custom config path
2. `policy.override.json`
3. `references/default-policy.json`

That keeps skill behavior and wrapper behavior aligned.

## Recommended Rejection Contract

For hard-gate mode:

- print only the configured rejection message,
- do not translate,
- do not explain,
- do not partially answer the prompt,
- exit with a non-zero code when appropriate.

## Logging Guidance

If the wrapper logs policy decisions, record:

- timestamp,
- status,
- mode,
- ratio,
- first clause language,
- config source.

Do not log full prompt contents if privacy requirements forbid it.

## Practical Next Step

If hard-gate enforcement becomes necessary, implement the wrapper first and keep the current skill as:

- policy source,
- config source,
- detector source,
- regression source.
