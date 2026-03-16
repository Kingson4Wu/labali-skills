# Architecture and Development Guidelines

## Layer Contract

| Layer | File | Purpose | Stability |
|-------|------|---------|-----------|
| **Policy** | `SKILL.md` | Goals, constraints, success criteria | **Stable** |
| **Strategy** | `references/*.md` | Workflow, semantic strategies, UI hints | **Moderate** |
| **Execution** | `scripts/*.ts` | Concrete implementation | **Mutable** |

**Key Principle:** Scripts are replaceable. Policy layer remains stable across UI changes.

---

## Policy Layer Boundaries (Development Constraints)

These constraints ensure `SKILL.md` remains stable and professional.

### SKILL.md MUST:
- Describe **what** to achieve, not **how**
- Use semantic/functional language (e.g., "readiness indicator", "publish control")
- Define success in business state terms (e.g., "episode in published list")
- Specify constraints as principles

### SKILL.md MUST NOT:
- Reference specific UI text strings (e.g., "Preview ready!", "Publish now")
- Include CSS selectors, XPath, or DOM query patterns
- Specify exact button labels, menu names, or placeholder text
- Hard-code URLs beyond entry domain
- Describe implementation details

### Correct Abstraction Examples

| Instead of | Write |
|------------|-------|
| `Wait for "Preview ready!"` | `Wait for upload readiness indicator` |
| `Click "Publish" button` | `Initiate publish action` |
| `Fill "Title" textbox` | `Provide episode title in designated field` |

### Where to Put Details

| Content | Location |
|---------|----------|
| UI pattern hints | `references/plan.md` |
| Actual selectors | `scripts/*.ts` |
| Meta-constraints | This file |

---

## Execution Model

```
Deterministic Cache → Policy Executor → Repair & Retry
     (optional)      (mandatory baseline)   (in-loop)
```

1. Run deterministic cache as optional fast path
2. On failure → auto-downgrade to policy executor
3. On policy failure → repair and retry until success
4. Record failures for optimization

---

## Semantic Interaction Standards

**Priority:**
1. Role + accessible name
2. Visible text candidates  
3. Label/placeholder-driven fills
4. Generic file-input fallback

**Never:** Static coordinates or positional indexes.

---

## Publish Correctness

- Validate by business state, not click success
- Verify in `Scheduled` if `publish_at` future; else `Published`
- Confirm episode not in `Draft`

---

## UI Change Protocol

| Change Type | Update |
|-------------|--------|
| Text change | `references/plan.md` only |
| Element move | `scripts/*.ts` only |
| New field | `plan.md` + `scripts/` |
| Workflow restructure | All layers |

---

## Script Roles

| Script | Role |
|--------|------|
| `auto-executor.ts` | Unified entry |
| `deterministic.ts` | Deterministic cache |
| `executor.ts` | Policy executor |
| `core.ts` | Shared primitives |
| `stage-detector.ts` | Stage inference |
| `publisher.ts` | Publish actions |
| `verifier.ts` | Post-publish validation |
