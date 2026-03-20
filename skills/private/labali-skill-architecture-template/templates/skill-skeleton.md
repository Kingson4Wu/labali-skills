# Skill Skeleton Template

Copy this skeleton when creating a new skill. Replace all `<placeholder>` values.
Delete sections that do not apply to the skill type.

---

## File: `SKILL.md`

```markdown
---
name: <skill-folder-name>
description: <One-sentence description. Start with a verb. End with "Use when <trigger condition>.">
license: MIT
compatibility: <macOS / Linux; required tools and runtime dependencies>
---

# <skill-folder-name>

<One-paragraph orientation: what this skill does, what layer model it uses, and the key invariant.>

## Required Constraints

- <Hard constraint 1 — what this skill must always do or never do>
- <Hard constraint 2>
- <Hard constraint 3>

## Success Criteria

A run is successful **only** when all conditions hold:

1. <Measurable business-state condition, not action success>
2. <Second condition if applicable>

## Runtime Inputs

See `skill.yaml` for complete input schema.

**Required:** `<param_1>`, `<param_2>`
**Optional:** `<param_3>`, `<param_4>`

## Resources

| File | Purpose |
|------|---------|
| `references/architecture.md` | Strategy layer: workflow, fallback, quality gates |
| `scripts/run.ts` | Execution entry point |
| `tests/` | Regression checks |
```

---

## File: `references/architecture.md`

```markdown
# Architecture

## Stage Model

| Stage | Trigger | Exit condition |
|-------|---------|----------------|
| `<stage_1>` | <what causes entry> | <what causes exit> |
| `<stage_2>` | <what causes entry> | <what causes exit> |
| `<stage_3>` | <what causes entry> | <what causes exit> |

## Execution Pattern

1. <Fast path / deterministic cache attempt — optional>
2. <Policy executor baseline — required>
3. <Bounded repair-and-retry on failure>
4. <Terminal business-state verification>

## Fallback Order

When <primary action> fails:
1. <First fallback>
2. <Second fallback>
3. <Final fallback or fail-fast>

## Quality Gates

- <What must be true before each major stage transition>
- <What the terminal verification checks>

## Known Edge Cases

- <Edge case 1>: <how to handle>
- <Edge case 2>: <how to handle>
```

---

## File: `skill.yaml`

```yaml
name: <skill-folder-name>
description: <Same one-sentence description as SKILL.md>
executor: scripts/run.ts
inputs:
  <param_1>:
    type: string
    required: true
    description: <What this parameter controls>
  <param_2>:
    type: string
    required: false
    default: "<default value>"
    description: <What this parameter controls>
```

---

## File: `agents/openai.yaml`

```yaml
version: 1
interface:
  display_name: <Human-readable name>
  description: <One sentence for skill matching and discovery>
  default_prompt: <Default prompt shown when skill is invoked>
```

---

## Directory layout

```
<skill-folder-name>/
├── SKILL.md                  # Policy layer (required)
├── skill.yaml                # Input schema (optional but recommended)
├── agents/
│   └── openai.yaml           # Discovery manifest (required)
├── references/
│   └── architecture.md       # Strategy layer (required for browser/hybrid)
├── scripts/
│   └── run.ts                # Execution entry point
├── tests/
│   └── test_regression.sh    # Regression checks
├── examples/                 # Good/anti-pattern examples (if AI generates content)
└── README.md                 # Usage documentation (required)
```
