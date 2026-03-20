# Good Skill Architecture Examples

These examples show well-structured skills that follow the layered policy-strategy-execution model.

---

## Example 1 — Browser skill: clear layer separation

**Skill:** `labali-xiaohongshu-download-post-assets`

**What makes it well-structured:**

### Policy layer (`SKILL.md`) — stable, semantic

```markdown
## Required Constraints

- Browser automation only; no Xiaohongshu APIs.
- Session reuse required; do not log in on every run.
- Success is validated by file existence on disk, not by click success.
```

- Constraints are behavioral, not implementation-specific
- Success criteria reference the business outcome (files on disk), not intermediate actions
- No mention of DOM selectors, CSS classes, or specific button text

### Strategy layer (`references/architecture.md`) — workflow without implementation

```markdown
## Stage Model

| Stage | Trigger | Exit condition |
|-------|---------|----------------|
| Login check | Script start | Creators dashboard is visible |
| Post navigation | Login confirmed | Post page is loaded |
| Asset extraction | Post page loaded | All media URLs collected |
| Download | URLs collected | All files written to disk |
```

- Stages are defined by business state, not by page URL or DOM snapshot
- Recovery order is specified per stage
- No hardcoded selectors in the strategy doc

### Execution layer (`scripts/`) — replaceable

- `executor.ts` implements the stage loop
- If Xiaohongshu changes its UI, only `executor.ts` needs updating
- `SKILL.md` and `references/architecture.md` remain valid

---

## Example 2 — Policy-only skill: minimal and focused

**Skill:** `labali-deterministic-script-writer`

**What makes it well-structured:**

- No `scripts/` directory — correctly absent for a policy-only skill
- `SKILL.md` defines clear input→output contract: "convert intent to spec"
- `references/architecture.md` documents the design principles (determinism, fail-fast, no retry)
- `references/prompt-template.md` gives Claude the invocation format without embedding it in policy

**Key pattern:** policy defines *what*, references define *how to think about it*, no execution layer needed when Claude is the executor.

---

## Example 3 — Correct success criteria formulation

**Good:**
```markdown
## Success Criteria

A run is successful only when all conditions hold:

1. The episode appears in the Published list (or Scheduled list if publish_at is future).
2. The same episode does NOT appear in the Draft list.
3. No unresolved required fields remain on the episode form.
```

**Why it works:**
- Conditions are checkable by observing business state
- Conditions are mutually exclusive and exhaustive for the happy path
- "action success" (clicking Publish) is explicitly excluded as a success signal

---

## Example 4 — Correct constraint formulation

**Good constraints:**
```markdown
- Use semantic interactions: role + accessible name > visible text > label/placeholder > bounded DOM fallback.
- Login is manual; never automate credential entry.
- Scope all delete operations to the Draft filter; never touch Published or Scheduled episodes.
```

**Why they work:**
- Each constraint is behavioral and testable
- They describe invariants, not implementation hints
- A different implementation (e.g., replacing Playwright with a different browser driver) would still need to satisfy these constraints
