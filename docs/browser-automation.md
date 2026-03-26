# Browser Automation Skills

> For anti-detection behavior principles, also load `docs/browser-anti-detection.md`.

Reference this document when working on a `browser` type skill.

## Execution Model

Entry point is `scripts/auto-executor.ts`, which:

1. Runs **startup check** — if `.cache/<skill>/pending-regen.json` exists, regenerate `scripts/cache/deterministic.ts` from the saved trajectory, then delete the marker.
2. Tries **deterministic cache** (`scripts/cache/deterministic.ts`) — fast replay of known UI paths.
3. Falls back to **policy executor** (`executor.ts`) — semantic re-discovery when UI has changed.
4. On deterministic failure + policy success: writes `pending-regen.json` marker (non-blocking); publish result is returned immediately, cache is repaired at the start of the next run.
5. Verifies success by **business state** (e.g., episode in Published list), not by click completion.

## Semantic Interaction Priority

Always prefer interactions in this order:

1. Role + accessible name
2. Visible text candidates
3. Label / placeholder-driven fills
4. Generic file-input fallback

Never use static coordinates, positional indexes, or DOM structure assumptions — UI layout shifts between sessions, viewports, and A/B variants.

## Policy Layer Boundaries

`SKILL.md` must use semantic language only — no UI strings, CSS selectors, or XPath.

| Correct | Wrong |
|---------|-------|
| "readiness indicator" | `"Preview ready!"` |
| "media upload confirmation state" | `.publish-button` |
| "publish control" | `#episode-form` |

`references/plan.md` may include observed UI patterns and concrete hints, but must mark them as observations, not requirements.

## Required Files

| File | Purpose |
|------|---------|
| `scripts/auto-executor.ts` | Unified entry point; runs startup check, deterministic, then policy |
| `scripts/cache/deterministic.ts` | Fast-path trajectory replay (generated artifact — auto-regenerated when stale) |
| `scripts/executor.ts` | Semantic fallback executor |
| `scripts/core.ts` | Shared types and input schema |
| `scripts/stage-detector.ts` | Stage inference from current page state |
| `scripts/publisher.ts` | Publish actions |
| `scripts/verifier.ts` | Post-action business-state validation |
| `scripts/run.ts` | CLI entry point; parses flags and invokes auto-executor |
| `scripts/run_deterministic.ts` | Direct entry point for deterministic cache only (bypasses auto-executor) |
| `package.json` | Playwright dependency (skill root) |
| `references/architecture.md` | Layer boundaries, regeneration protocol, and development constraints |
| `references/plan.md` | Step-by-step workflow strategy and UI pattern hints |
