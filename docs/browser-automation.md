# Browser Automation Skills

Reference this document when working on a `browser` type skill.

## Execution Model

Entry point is `scripts/auto-executor.ts`, which:

1. Tries **deterministic trajectory** (`deterministic.ts`) first — fast replay of known UI paths.
2. Falls back to **policy executor** (`executor.ts`) — semantic re-discovery when UI has changed.
3. Verifies success by **business state** (e.g., episode appears in Published list), not by click completion.

## Policy Layer Boundaries

`SKILL.md` must use semantic language only — no UI strings, CSS selectors, or XPath.

- Correct: "readiness indicator", "media upload confirmation state"
- Wrong: `"Preview ready!"`, `.publish-button`, `#episode-form`

`references/` may include observed UI patterns and concrete hints, but must mark them as observations, not requirements.

## Required Files

| File | Purpose |
|------|---------|
| `scripts/auto-executor.ts` | Unified entry point |
| `scripts/deterministic.ts` | Fast-path trajectory replay |
| `scripts/executor.ts` | Semantic fallback executor |
| `scripts/core.ts` | Shared types and input schema |
| `scripts/run.ts` | CLI wrapper with `ensureDeps()` |
| `package.json` | Playwright dependency (skill root) |
| `references/architecture.md` | UI pattern hints and recovery rules |
| `references/plan.md` | Step-by-step workflow strategy |
