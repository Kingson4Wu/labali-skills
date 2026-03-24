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
  (primary fast path)  (adaptive fallback)   (in-loop)
```

1. Run deterministic cache as optional fast path
2. On failure → auto-downgrade to policy executor
3. On policy failure → repair and retry until success
4. Record failures for optimization — log deterministic failure context and use policy-success evidence to improve deterministic mode.

---

## Regeneration Protocol

When the deterministic cache is stale (fails) but the policy executor succeeds:

1. Policy executor writes a trajectory log to `.cache/spotify-publish/policy-trajectory-latest.json`
2. `auto-executor.ts` writes a `.cache/spotify-publish/pending-regen.json` marker (non-blocking)
3. Publish result is returned immediately — no delay waiting for regeneration

At the **start of the next interactive run**, the startup check fires:

4. AI agent reads `pending-regen.json` (contains `trajectory_path` and `deterministic_path`)
5. AI agent reads the trajectory log and rewrites `scripts/cache/deterministic.ts`
   using role+name patterns only — no hardcoded ref keys
6. `pending-regen.json` is deleted
7. Normal publish workflow proceeds with repaired deterministic cache

**Trigger condition:** deterministic attempted AND failed, policy succeeded.
**No trigger:** deterministic succeeded (no regeneration needed), or policy also failed.

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

When Spotify updates their UI:

1. Check if semantic goals are still achievable (SKILL.md constraints).
2. Update `references/plan.md` with new UI pattern hints.
3. Update `scripts/` with new selectors/matching logic.
4. Do NOT modify `SKILL.md` unless the fundamental workflow changes.

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
| `scripts/auto-executor.ts` | Unified entry |
| `scripts/cache/deterministic.ts` | Deterministic cache (generated artifact — auto-regenerated when stale) |
| `scripts/executor.ts` | Policy executor |
| `scripts/core.ts` | Shared primitives |
| `scripts/stage-detector.ts` | Stage inference |
| `scripts/publisher.ts` | Publish actions |
| `scripts/verifier.ts` | Post-publish validation |
| `scripts/run.ts` | CLI entry point; parses flags and invokes auto-executor |
| `scripts/run_deterministic.ts` | Direct entry point for running deterministic cache only (bypasses auto-executor) |
| `tests/test_regression.sh` | Regression checks |
