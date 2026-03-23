# Claude Skill Building Guide (Anthropic Official)

---

## File Structure

```
your-skill-name/          # kebab-case, no spaces / underscores / capitals
├── SKILL.md              # Required — exact spelling, case-sensitive
├── scripts/              # Optional: executable code (Python, Bash, etc.)
├── references/           # Optional: documentation loaded on demand
└── assets/               # Optional: templates, fonts, icons
```

- Do **not** place a README.md inside the skill folder (put it at the repo level instead)
- Keep SKILL.md under 5,000 words

---

## YAML Frontmatter

```yaml
---
name: skill-name-in-kebab-case
description: What it does and when to use it (include specific phrases users would say).
license: MIT                     # optional
allowed-tools: "Bash(python:*)"  # optional: restrict tool access
metadata:                        # optional
  author: Your Name
  version: 1.0.0
  mcp-server: server-name
---
```

**Rules:**
- `name`: kebab-case only, no spaces, no capitals, must match folder name
- `description`: **must include both** what it does + when to use it, ≤ 1024 characters, **no XML tags** (`< >`)
- Names containing `"claude"` or `"anthropic"` are reserved and forbidden

---

## Writing the Description

Structure: **[What it does] + [When to use it] + [Trigger keywords]**

```yaml
# ✅ Good — specific with trigger phrases
description: Manages Linear project workflows including sprint planning, task creation,
  and status tracking. Use when the user mentions "sprint", "Linear tasks",
  "project planning", or asks to "create tickets".

# ✅ Good — includes file type
description: Analyzes Figma design files and generates developer handoff documentation.
  Use when the user uploads .fig files or asks for "design specs" or
  "design-to-code handoff".

# ❌ Bad — too vague
description: Helps with projects.

# ❌ Bad — missing trigger conditions
description: Creates sophisticated multi-page documentation systems.
```

---

## Three Skill Categories

| Category | Use When | Official Examples |
|----------|----------|-------------------|
| **Document & Asset Creation** | Producing consistent documents, designs, code output | `frontend-design`, `docx`, `pptx` |
| **Workflow Automation** | Multi-step processes that benefit from a consistent methodology | `skill-creator` |
| **MCP Enhancement** | Adding workflow guidance on top of MCP tool access | `sentry-code-review` |

---

## Instruction Body Structure

````markdown
---
name: your-skill
description: ...
---

# Skill Name

## Instructions

### Step 1: [First Major Step]
Clear explanation of what happens. Give the exact command and expected output.

```bash
python scripts/do_thing.py --input {filename}
# Expected output: ...
```

## Examples

**Example: [common scenario]**
User says: "..."
Actions: 1. ... 2. ...
Result: ...

## Troubleshooting

**Error: [error message]**
Cause: ...   Solution: ...
````

**Principles for writing instructions:**
- Provide commands and decision frameworks — not self-evident steps Claude already knows
- Include an explicit **NEVER list** (anti-patterns, things that must never be done)
- Include a decision tree when multiple paths exist
- Cover common pitfalls and edge cases
- Put critical instructions at the top under `## Critical` or `## Important` headers
- Creative tasks → give direction and principles; fragile operations (file formats, etc.) → give exact scripts

---

## 5 Workflow Patterns

### Pattern 1: Sequential Orchestration
Use when: users need a multi-step process executed in a specific order.
```markdown
### Step 1: Create Account
Call MCP tool: `create_customer`, params: name, email, company

### Step 2: Set Up Payment
Call MCP tool: `setup_payment_method` — wait for payment verification

### Step 3: Create Subscription
Call MCP tool: `create_subscription`, params: plan_id, customer_id (from Step 1)
```
Key techniques: explicit ordering, inter-step dependencies, per-stage validation, rollback instructions on failure.

### Pattern 2: Multi-MCP Coordination
Use when: the workflow spans multiple services.
```markdown
## Phase 1: Design Export (Figma MCP)
Export assets, generate design specs, create asset manifest

## Phase 2: Asset Storage (Drive MCP)
Create project folder, upload assets, generate shareable links

## Phase 3: Task Creation (Linear MCP)
Create dev tasks, attach asset links, assign to engineering team
```
Key techniques: clear phase separation, data passing between MCPs, validation before advancing to the next phase.

### Pattern 3: Iterative Refinement
Use when: output quality improves through iteration (report generation, content creation, etc.).
```markdown
## Initial Draft
Fetch data via MCP → generate first draft → save to temp file

## Quality Check
Run `scripts/check_report.py` → identify issues (missing sections, formatting, data errors)

## Refinement Loop
Fix each issue → regenerate affected sections → re-validate → repeat until quality threshold met
```

### Pattern 4: Context-Aware Tool Selection
Use when: the same outcome requires different tools depending on context.
```markdown
## Decision Tree
1. Check file type and size
2. Choose storage location:
   - Large files (>10MB) → cloud storage MCP
   - Collaborative docs → Notion MCP
   - Code files → GitHub MCP
3. Explain to the user why that tool was chosen
```

### Pattern 5: Domain-Specific Intelligence
Use when: the skill must apply domain rules beyond simple tool invocation (compliance, auditing, etc.).
```markdown
## Pre-Processing (Compliance Check)
1. Check sanctions lists, verify jurisdiction, assess risk level
2. Document compliance decision

## Processing
IF compliance passed → call payment MCP, apply fraud checks
ELSE → flag for review, create compliance case

## Audit Trail
Log all checks and decisions, generate audit report
```

---

## Reference Loading Triggers (required when `references/` exists)

Agents will not load references automatically — embed explicit instructions at each workflow decision point:

```markdown
### Creating a New Document
**MANDATORY - READ ENTIRE FILE**: Before proceeding, you MUST read
[`docx-js.md`](docx-js.md) completely. **NEVER set any line range limits.**
```

Use a routing table to solve both under-loading and over-loading at once:

| Task Type | Must Load | Do NOT Load |
|-----------|-----------|-------------|
| Create new document | `docx-js.md` | `ooxml.md` |
| Simple edit | `ooxml.md` | `docx-js.md` |

---

## Three-Layer Loading Architecture

| Layer | Content | Loaded When | Size |
|-------|---------|-------------|------|
| Layer 1: YAML frontmatter | name + description | Always in memory | ~100 tokens |
| Layer 2: SKILL.md body | Instructions, decision trees, examples | On trigger | < 5,000 tokens |
| Layer 3: references/ | Detailed docs, scripts | On demand | No limit |

---

## Testing

**Core technique: iterate on a single challenging task until Claude succeeds, then extract that winning approach into a skill.**

### Trigger Testing
```
✅ Should trigger: direct phrasing, paraphrased requests, synonyms
❌ Should NOT trigger: unrelated topics
```
Debug: ask Claude `"When would you use the [skill name] skill?"` — Claude will quote the description back; adjust based on what's missing.

### Functional Testing
Run the same task 3–5 times and compare outputs for structural consistency and quality stability.

### Performance Comparison
Compare token consumption, tool call count, and API failure rate with vs. without the skill enabled.

---

## Iteration Signals

| Symptom | Signal | Fix |
|---------|--------|-----|
| Under-triggering | Skill doesn't load automatically; users enable it manually | Add more keywords and trigger phrases to the description |
| Over-triggering | Skill loads for unrelated queries; users disable it | Add negative triggers; narrow the scope |
| Instructions not followed | Inconsistent results; user corrections needed | Move critical instructions to the top; use `CRITICAL` headers; replace language instructions with scripts for key validations (code is deterministic; language is not) |
| MCP call failures | Errors, retries | Test MCP independently without the skill; verify tool name casing; check API keys / OAuth tokens |
| Slow responses | Too many skills active simultaneously | Keep concurrent enabled skills under 20–50; keep SKILL.md under 5,000 words; move details to `references/` |

---

## Checklist

```
Structure
[ ] Folder named in kebab-case
[ ] File named exactly SKILL.md (case-sensitive)
[ ] YAML frontmatter has --- delimiters
[ ] name: kebab-case, no spaces, no capitals
[ ] description: includes what + when, no XML tags

Content Quality
[ ] Does not explain concepts Claude already knows
[ ] No mechanical Step 1, 2, 3 (unless the operation is genuinely fragile)
[ ] Has a NEVER list (anti-patterns)
[ ] Has a decision tree or selection guide when multiple paths exist
[ ] Covers common pitfalls and edge cases
[ ] Critical instructions are at the top

Loading Mechanism (only when references/ exists)
[ ] Every reference file has a clear loading trigger
[ ] Triggers are embedded within workflow steps
[ ] Routing table prevents over-loading

Testing
[ ] Triggers on obvious phrasings
[ ] Triggers on paraphrased requests
[ ] Does not trigger on unrelated topics
[ ] Functional tests pass
```
