# labali-skill-architecture-template

Reusable template skill for authoring robust new skills with layered architecture.

## What it provides

- Policy-layer skeleton for stable intent and constraints.
- Strategy-layer standards for stage model, fallback order, and quality gates.
- Reusable prompt templates for:
  - creating new layered skills,
  - refactoring existing skills into layered design,
  - setting execution preferences consistently.

## Files

- `SKILL.md`: execution contract and architecture baseline.
- `references/architecture.md`: strategy-level standards.
- `references/prompt-template.md`: copy-ready prompts.
- `agents/openai.yaml`: default interface metadata.

## Recommended usage

1. Copy architecture and prompt templates into your new skill workflow.
2. Keep policy docs semantic and stable.
3. Keep scripts modular and replaceable.
4. Validate completion by terminal business-state checks.

## How to use

### Option 1: Copy prompt templates (fastest)

1. Open `references/prompt-template.md`.
2. Copy `Architecture Preference Prompt`.
3. Paste it into your new skill request, then append your business goal and constraints.

Example:

```text
Use the architecture preference below to create a new skill for <your task>.
[paste Architecture Preference Prompt]
Business goal: ...
Required inputs: ...
Success criteria: ...
```

### Option 2: Explicit skill invocation

Install:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-skill-architecture-template
```

Invoke in chat:

```text
Please use $labali-skill-architecture-template to generate a new skill skeleton for <your task>.
Include SKILL.md policy contract, references/architecture.md strategy, and script module split.
```

### Suggested workflow

1. Generate `SKILL.md` and `references/architecture.md` first.
2. Implement `scripts/*` modules based on the strategy.
3. Add regression tests for critical path and fallback path.
4. Run `npm run skills:validate`.
