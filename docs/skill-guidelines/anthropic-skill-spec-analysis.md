# Anthropic Skill Specification: Principles for Writing High-Quality Skills

> [Source: Anthropic official skill-creator specification + analysis of 17 official Skill examples](https://mp.weixin.qq.com/s/hcqMHkTUVd5iIe7XdpNSzw)


---

## Core Formula

```
Good Skill = Expert-exclusive knowledge - What Claude already knows
```

- A Skill is not a tutorial. It is **externalized expert knowledge** — thinking frameworks, decision principles, anti-pattern intuitions, and edge-case experience.
- Claude already knows how to write code, debug, handle PDFs, and what flexbox is. **Do not teach these.**
- For every piece of content you write, ask: Does Claude genuinely not know this? Would removing it affect task quality? Is this worth its token cost?

---

## 6 Core Standards

### 1. Token Efficiency

- Only include knowledge Claude does not already have.
- Do not explain foundational concepts.
- Do not write self-evident procedural steps.

### 2. Convey Mental Models, Not Mechanical Steps

**Don't:** Step 1, Step 2, Step 3 (Claude already knows how to operate)

**Do:** Convey **how an expert thinks** — which key questions to answer before acting, how to make decisions under uncertainty.

**Example** (based on official `frontend-design`):
```
Before writing any code, answer:
- Purpose: What problem does this interface solve? Who uses it?
- Tone: Commit to an extreme direction — brutally minimal, maximalist chaos, retro-futuristic...
- Differentiation: What makes this UNFORGETTABLE?
```

### 3. Explicit Anti-Pattern List (NEVER list)

Half of expert knowledge is knowing what must never be done. Write these out explicitly to define a quality floor.

**Example**:
```
NEVER use generic AI-generated aesthetics:
- Overused fonts: Inter, Roboto, Arial
- Cliché color schemes: purple gradients on white backgrounds
- Predictable 8px border-radius on everything
```

### 4. Description Must Specify Trigger Conditions

- The description is the **only part always in memory**. The Agent uses it to decide whether to activate the Skill.
- Must include: what it does + when to use it + relevant keywords.

**Good description**:
```yaml
description: "Comprehensive document creation, editing, and analysis with support
  for tracked changes, comments, formatting preservation, and text extraction.
  Use when Claude needs to work with professional documents (.docx files) for:
  (1) Creating new documents, (2) Modifying or editing content,
  (3) Working with tracked changes, (4) Adding comments, or any other document tasks."
```

**Poor description**:
```yaml
description: "Handle document-related tasks"
```

### 5. Match Freedom Level to Task Fragility

| Task Type | Freedom Level | Approach |
|-----------|--------------|----------|
| Creative design (many valid approaches) | High | Give principles and direction, not steps |
| Code review, process-driven tasks | Medium | Give frameworks and decision principles |
| File format operations (error-prone) | Low | Give exact scripts with minimal parameters |

**Rule of thumb:** If the Agent makes one wrong step, what is the consequence? High consequence → low freedom.

### 6. Reference Loading Triggers (required when a `references/` directory exists)

Agents will not intelligently load references on their own. You must embed explicit loading instructions at workflow decision points.

**Technique 1: MANDATORY command**
```markdown
### Creating a New Document
**MANDATORY - READ ENTIRE FILE**: Before proceeding, you MUST read
[`docx-js.md`](docx-js.md) (~500 lines) completely from start to finish.
**NEVER set any range limits when reading this file.**
```

**Technique 2: Routing table** (solves both under-loading and over-loading)

| Task Type | Must Load | Do NOT Load |
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

## 5 Skill Types

| Task Characteristics | Recommended Type | Lines | Loading Trigger |
|----------------------|-----------------|-------|----------------|
| Requires taste and creativity | Minimal Mental Model | 30–50 | Not needed |
| Requires uniqueness and craft | Philosophy + Execution | 100–150 | Optional |
| Multiple distinct sub-scenarios | Navigation | 20–50 | Simple routing |
| Complex multi-step project | Process-Oriented | 150–300 | Staged |
| Precise operations on specific formats | Tool Operation | 200–500 | Carefully designed |

### Type 1: Minimal Mental Model (e.g. `frontend-design`, 43 lines)

- Teaches thinking, not technical details.
- Fully self-contained in `SKILL.md`, no `references/` directory.
- Focuses on taste, differentiation, and anti-patterns.
- No loading trigger needed.

### Type 2: Tool Operation (e.g. `docx`, 197 lines)

- Decision tree routes quickly to the correct workflow.
- MANDATORY loading instructions at each workflow entry.
- Detailed code examples + extensive reference docs (300–600 lines each).
- Low freedom, exact steps required.
- Requires carefully designed loading triggers.

### Type 3: Process-Oriented (e.g. `mcp-builder`, 237 lines)

- Clear multi-stage workflow (e.g. Research → Implement → Test → Evaluate).
- Each stage has defined outputs and checkpoints.
- References organized by stage or technology choice.
- Requires staged loading triggers.

### Type 4: Philosophy + Execution (e.g. `canvas-design`, 130 lines)

- Two-phase flow: Philosophy (creative concept) → Express (execution).
- Emphasizes craft quality and masterful execution.
- References are optional illustrative examples.
- Best for creative generation tasks where uniqueness matters most.

### Type 5: Navigation (e.g. `internal-comms`, 33 lines)

- `SKILL.md` is minimal — acts only as a router.
- Detailed content lives in `examples/` subdirectory.
- Best when there are multiple well-defined sub-scenarios, each with its own guide.

```markdown
## How to use this skill
1. Identify the communication type from the request.
2. Load the appropriate guideline file:
   - `examples/3p-updates.md` — Progress/Plan/Problem updates
   - `examples/company-newsletter.md` — Company newsletters
3. Follow the specific instructions in that file.
```

---

## Design Checklist

```
Basics
[ ] Has YAML frontmatter with name and description
[ ] Description includes both "what it does" and "when to use it"
[ ] SKILL.md body is under 500 lines

Content Quality
[ ] Does not explain concepts Claude already knows
[ ] No mechanical Step 1, Step 2, Step 3 sequences
[ ] Has an explicit anti-pattern list (NEVER list)
[ ] Has a decision tree or selection guide when multiple paths exist
[ ] Covers common pitfalls and edge cases

Loading Mechanism (only for Skills with references/)
[ ] Every reference file has a clear loading trigger condition
[ ] Trigger conditions are embedded within workflow steps
[ ] Has a mechanism to prevent over-loading

Freedom Level
[ ] Creative tasks → high freedom (principles, not procedures)
[ ] Fragile operations → low freedom (exact scripts)
```

---

## Questions to Answer Before Writing a Skill

- How does a top expert in this domain **think** through the problem?
- What are their core decision-making principles?
- What pitfalls have they encountered? What would they never do?
- What knowledge is **not** in Claude's training but is essential for this task?

---

## Three-Layer Skill Loading Architecture

```
Layer 1: Metadata  (always in memory)
  name + description only — ~100 tokens/skill

Layer 2: SKILL.md Body  (loaded on trigger)
  Guidelines, code examples, decision trees — < 5,000 tokens

Layer 3: Resources  (loaded on demand)
  scripts/, references/, assets/ — no size limit
```
