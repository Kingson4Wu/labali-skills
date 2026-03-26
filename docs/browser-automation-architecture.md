# Browser Automation Skill Architecture

Reference this document when working on a `browser` type skill.

---

## Design Philosophy

Three principles underpin every browser automation skill:

1. **Stable policy** — `SKILL.md` describes goals in semantic language; it does not change when the target site's UI changes.
2. **Fast-path execution** — a deterministic executor replays known-good interaction paths for speed, alongside an adaptive executor that explores candidates at runtime.
3. **LLM-assisted self-healing** — when the fast path breaks, the adaptive executor takes over transparently, records a trajectory, and the LLM rebuilds the fast path at the next startup. The user never intervenes.

---

## Three-Layer Architecture

| Layer | Location | Purpose | Stability |
|-------|----------|---------|-----------|
| **Policy** | `SKILL.md` | Goals, constraints, success criteria | **Stable** — survives UI changes |
| **Strategy** | `references/` | Workflow stages, semantic strategies, UI hints | **Moderate** — updated when UI patterns shift |
| **Execution** | `scripts/` | Concrete implementation | **Mutable** — fully replaceable |

**Key principle:** scripts are replaceable; the policy layer is not. A UI redesign should never require editing `SKILL.md`.

---

## Execution Model

Entry point is `scripts/auto-executor.ts`, which runs this sequence on every invocation:

1. **Startup check (LLM-executed)** — on each interactive run, the LLM agent checks if `.cache/<skill>/pending-regen.json` exists. If so, it reads the saved trajectory and rewrites `scripts/cache/deterministic.ts` (role+name patterns only), deletes the marker, then proceeds. This is an instruction to the LLM, not an automated in-process step.
2. **Fast-path executor** (`scripts/cache/deterministic.ts`) — replays the known-good interaction path directly. Fails fast if anything deviates.
3. **Adaptive executor** (`scripts/executor.ts`) — explores semantic candidates at runtime, handles unexpected page states, retries with fallbacks. Runs when the fast path fails or is disabled.
4. **On fast-path failure + adaptive success** — adaptive executor records a trajectory log and `auto-executor.ts` writes `pending-regen.json` (non-blocking). The result is returned immediately; the fast path is repaired at the next startup.
5. **Success is verified by business state** — not by click completion. A publish action succeeding and the episode being live are two separate events.

### Adaptive vs Fast-path Executor

| | Adaptive executor | Fast-path executor |
|-|-------------------|--------------------|
| **Behavior** | Explores all candidate refs per step; multi-layer fallback | Walks the learned path directly; no branching |
| **Speed** | Slower — takes snapshots and iterates candidates | Faster — goes straight to known interactions |
| **Resilience** | Handles unexpected states, A/B variants, partial UI changes | Fails fast on deviation; falls back to adaptive |
| **Role** | Source of truth; teacher | Optimized replica; learner |

The adaptive executor is the system's reference implementation. The fast-path executor is a performance optimization derived from it.

### LLM Self-Healing Loop

```
Fast-path fails
    → Adaptive executor runs → succeeds
    → Trajectory written to .cache/<skill>/policy-trajectory-latest.json
    → pending-regen.json marker written (non-blocking)
    → Result returned immediately

Next run startup check:
    → LLM reads pending-regen.json + trajectory
    → LLM rewrites scripts/cache/deterministic.ts (role+name patterns only)
    → pending-regen.json deleted
    → Fast path works again
```

The "automatic" in self-healing means the user only needs to run the skill again — the LLM handles regeneration as part of the startup check.

---

## Semantic Interaction Priority

Always prefer interactions in this order:

1. Role + accessible name
2. Visible text candidates
3. Label / placeholder-driven fills
4. Generic file-input fallback

Never use static coordinates, positional indexes, or DOM structure assumptions — UI layout shifts between sessions, viewports, and A/B variants. This applies to both executors.

---

## Policy Layer Boundaries

`SKILL.md` must use semantic language only — no UI strings, CSS selectors, or XPath.

| Correct | Wrong |
|---------|-------|
| "readiness indicator" | `"Preview ready!"` |
| "media upload confirmation state" | `.publish-button` |
| "publish control" | `#episode-form` |

`references/plan.md` may include observed UI patterns and concrete hints, but must mark them as observations, not requirements.

### NEVER

- **Never report success based on click completion alone** — always verify by observable business state (e.g., episode appears in Published list). Click success and business outcome are separate events.
- **Never use static coordinates, positional indexes, or DOM structure assumptions** — these break across viewport changes and A/B variants.
- **Never include UI strings, selectors, or XPath in `SKILL.md`** — the policy layer must remain stable across UI changes.
- **When regenerating the fast-path executor, use role+name patterns only** — no hardcoded DOM name attributes, test IDs, or ref keys.

---

## UI Change Protocol

When the target site updates its UI:

| Change type | What to update |
|-------------|---------------|
| Text/label changed | `references/plan.md` UI hints only |
| Element moved | `scripts/` selectors/matching logic only |
| New field added | `references/plan.md` + `scripts/` |
| Business workflow restructured (not just UI) | All layers |
| Fundamental goal changed | `SKILL.md` + all layers |

Do **not** modify `SKILL.md` unless the underlying business goal or constraint changes — not just because a button moved.

---

## Reference File Structure

The following structure is demonstrated by the `labali-spotify-publish-episode` skill. Use it as a starting template; adapt file names and responsibilities to the specific skill's workflow.

**Core files (required in every browser skill):** `auto-executor.ts`, `executor.ts`, `core.ts`. All others are workflow-specific — rename, split, or omit as the skill requires.

| File | Purpose |
|------|---------|
| `scripts/auto-executor.ts` | Unified entry point; runs startup check, fast path, then adaptive |
| `scripts/cache/deterministic.ts` | Fast-path executor (LLM-generated artifact — rebuilt automatically when stale) |
| `scripts/executor.ts` | Adaptive executor; semantic fallback and source of trajectory data |
| `scripts/core.ts` | Shared types and input schema |
| `scripts/stage-detector.ts` | Stage inference from current page state |
| `scripts/publisher.ts` | Workflow actions (e.g., submit, publish) — name to match the skill's domain |
| `scripts/verifier.ts` | Post-action business-state validation |
| `scripts/run.ts` | CLI entry point; parses flags and invokes auto-executor |
| `scripts/run_deterministic.ts` | Direct entry point for fast-path only (bypasses auto-executor) |
| `package.json` | Playwright dependency (skill root) |
| `references/architecture.md` | Layer boundaries, regeneration protocol, and development constraints |
| `references/plan.md` | Step-by-step workflow strategy and observed UI pattern hints |
