# Skill Creation & Optimization Reference

> Consolidated from `docs/skill-guidelines/` — use this when creating or improving skills.

---

## File Structure

```
your-skill-name/          # kebab-case, no spaces / underscores / capitals
├── SKILL.md              # Required — exact spelling, case-sensitive
├── scripts/              # Optional: executable code (Python, Bash, etc.)
├── references/           # Optional: documentation loaded on demand
└── assets/               # Optional: templates, fonts, icons
```

- No README.md inside the skill folder (put it at the repo level)
- Keep SKILL.md under 5,000 words

---

## YAML Frontmatter

```yaml
---
name: skill-name-in-kebab-case      # required, must match folder name
description: What it does + when to use it + trigger keywords. ≤ 1024 chars, no XML tags.
license: MIT                        # optional
allowed-tools: "Bash(python:*)"     # optional: restrict tool access
metadata:                           # optional
  author: Name
  version: 1.0.0
  mcp-server: server-name
---
```

**Rules:**
- `name`: kebab-case only, no capitals, must not contain `claude` or `anthropic`
- `description`: **must include both** what it does + when to use it + trigger phrases

**Description examples:**

```yaml
# ✅ Good — specific with trigger phrases
description: Manages Linear sprint workflows including task creation and status tracking.
  Use when user mentions "sprint", "Linear tasks", or asks to "create tickets".

# ❌ Bad — missing trigger conditions
description: Helps with projects.
```

---

## Core Design Principles

### The Good Skill Formula

```
Good Skill = Expert-exclusive knowledge − What Claude already knows
```

A Skill is not a tutorial. It is **externalized expert knowledge**: decision frameworks, anti-pattern intuitions, edge-case experience.
Claude already knows how to write code, debug, handle PDFs, etc. **Do not teach these.**

For every piece of content, ask: Does Claude genuinely not know this? Would removing it affect quality? Is it worth the token cost?

### 6 Core Standards

| # | Standard | Key point |
|---|----------|-----------|
| 1 | **Token efficiency** | Only include knowledge Claude doesn't already have |
| 2 | **Convey mental models, not steps** | Write how an expert *thinks*, not Step 1/2/3 sequences |
| 3 | **Explicit anti-pattern list** | Must have a NEVER list — defines the quality floor |
| 4 | **Description must specify trigger conditions** | Description is the only part always in memory; the Agent uses it to decide activation |
| 5 | **Match freedom level to task fragility** | Creative tasks → high freedom (principles); error-prone ops → low freedom (exact scripts) |
| 6 | **Reference loading triggers** | Agents won't load references automatically — embed explicit instructions in the workflow |

**Freedom level guide:**

| Task type | Freedom | Approach |
|-----------|---------|----------|
| Creative design (many valid approaches) | High | Give principles and direction |
| Code review, process-driven tasks | Medium | Give frameworks and decision principles |
| File format operations (error-prone) | Low | Give exact scripts with minimal parameters |

---

## Three-Layer Loading Architecture

```
Layer 1: YAML frontmatter  — always in memory, ~100 tokens/skill
Layer 2: SKILL.md body     — loaded on trigger, < 5,000 tokens
Layer 3: references/       — loaded on demand, no size limit
```

Keep concurrently enabled skills under 20–50.

---

## 5 Skill Types

| Type | Use when | Lines | Loading trigger |
|------|----------|-------|----------------|
| **Minimal Mental Model** (e.g. `frontend-design`) | Task requires taste and creativity | 30–50 | Not needed |
| **Philosophy + Execution** (e.g. `canvas-design`) | Task requires uniqueness and craft | 100–150 | Optional |
| **Navigation** (e.g. `internal-comms`) | Multiple distinct, well-defined sub-scenarios | 20–50 | Simple routing |
| **Process-Oriented** (e.g. `mcp-builder`) | Complex multi-stage projects | 150–300 | Staged |
| **Tool Operation** (e.g. `docx`) | Precise operations on specific formats | 200–500 | Carefully designed |

- **Minimal Mental Model**: self-contained in SKILL.md, no references, teaches thinking not techniques
- **Navigation**: SKILL.md only routes; detailed content lives in `examples/` subdirectory
- **Tool Operation**: decision tree for fast routing + MANDATORY load instructions + detailed code examples

---

## 5 Content Design Patterns (ADK Patterns)

| Pattern | Use to… | Key mechanism |
|---------|---------|---------------|
| **Tool Wrapper** | Give the agent on-demand framework expertise | Keyword trigger → load `references/` on demand |
| **Generator** | Produce consistent structured output every run | Template in `assets/` + style guide in `references/` |
| **Reviewer** | Score/audit against a swappable severity checklist | Rubric in `references/`; swap file to change domain |
| **Inversion** | Force context gathering before acting on ambiguous requirements | Hard gate: "DO NOT proceed until all phases complete" |
| **Pipeline** | Enforce a strict multi-step workflow with mandatory checkpoints | Sequential steps + explicit user-approval gates between steps |

Patterns compose: a Pipeline can include a Reviewer step at the end; a Generator can start with Inversion to collect variables first.

---

## 5 Workflow Orchestration Patterns (MCP Scenarios)

| Pattern | Use when | Key techniques |
|---------|----------|----------------|
| **Sequential Orchestration** | Multi-step process in strict order | Explicit ordering, inter-step dependencies, rollback on failure |
| **Multi-MCP Coordination** | Workflow spans multiple services | Clear phase separation, data passing between MCPs, validate before advancing |
| **Iterative Refinement** | Output quality improves through iteration | Draft → quality check → fix loop until threshold met |
| **Context-Aware Tool Selection** | Same goal, different tools depending on context | Decision tree + explain tool choice to user |
| **Domain-Specific Intelligence** | Must apply domain rules (compliance, auditing) | Pre-processing checks, conditional branching, audit trail |

---

## Reference Loading Mechanism

Agents will not load references automatically — embed explicit loading instructions at each workflow decision point.

**Technique 1: MANDATORY command**
```markdown
### Creating a New Document
**MANDATORY - READ ENTIRE FILE**: Before proceeding, you MUST read
[`docx-js.md`](docx-js.md) completely. **NEVER set any line range limits.**
```

**Technique 2: Routing table** (prevents both under-loading and over-loading)

| Task type | Must load | Do NOT load |
|-----------|-----------|-------------|
| Create new document | `docx-js.md` | `ooxml.md`, `redlining.md` |
| Simple edit | `ooxml.md` | `docx-js.md`, `redlining.md` |
| Tracked changes | `redlining.md` | `docx-js.md` |

**Technique 3: Keyword-based scene detection**
```markdown
**Scene A: New project** (user says "build from scratch", "create a new...")
→ MUST load: `references/greenfield.md`

**Scene B: Bug fix** (user says "X is broken", "fix this bug")
→ MUST load: `references/bugfix.md`
```

---

## Testing & Iteration

**Core method:** Iterate on a single challenging task until Claude succeeds, then extract the winning approach into a skill.

**Trigger testing:**
- Should trigger: direct phrasing, paraphrased requests, synonyms
- Should NOT trigger: unrelated topics
- Debug tip: ask Claude `"When would you use the [skill name] skill?"` — adjust description based on what it quotes back

**Functional testing:** Run the same task 3–5 times; check for structural consistency and quality stability.

**Iteration signals:**

| Symptom | Signal | Fix |
|---------|--------|-----|
| Under-triggering | Skill doesn't load automatically | Add more keywords and trigger phrases to description |
| Over-triggering | Loads for unrelated queries | Add negative triggers; narrow scope |
| Instructions not followed | Inconsistent results | Move critical instructions to top; use `CRITICAL` headers; replace language instructions with scripts for key validations |
| MCP call failures | Errors, retries | Test MCP independently; verify tool name casing; check API keys |
| Slow responses | Too many skills active | Keep concurrent skills ≤ 20–50; SKILL.md ≤ 5,000 words; move details to `references/` |

---

## Complete Checklist

```
Structure
[ ] Folder named in kebab-case
[ ] File named exactly SKILL.md (case-sensitive)
[ ] YAML frontmatter has --- delimiters
[ ] name: kebab-case, no spaces, no capitals, no "claude"/"anthropic"
[ ] description: includes what + when + triggers, no XML tags, ≤ 1024 chars

Content Quality
[ ] Does not explain concepts Claude already knows
[ ] No mechanical Step 1/2/3 (unless operation is genuinely fragile)
[ ] Has a NEVER list (anti-patterns)
[ ] Has a decision tree or selection guide when multiple paths exist
[ ] Covers common pitfalls and edge cases
[ ] Critical instructions are at the top (Critical/Important headers)
[ ] Creative tasks → principles; fragile operations → exact scripts

Loading Mechanism (only when references/ exists)
[ ] Every reference file has a clear loading trigger condition
[ ] Trigger conditions are embedded within workflow steps
[ ] Routing table prevents over-loading

Testing
[ ] Triggers on obvious phrasings
[ ] Triggers on paraphrased requests
[ ] Does not trigger on unrelated topics
[ ] Functional tests pass (3–5 runs consistent)
```

---

## Questions to Answer Before Writing a Skill

1. How does a top expert in this domain **think** through the problem?
2. What are their core decision-making principles?
3. What pitfalls have they encountered? What would they **never** do?
4. What knowledge is **not in Claude's training** but essential for this task?
