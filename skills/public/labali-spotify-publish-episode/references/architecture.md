# Architecture and Standards

## 1) Layered Boundaries

Use this layered model for complex UI automation. For simple one-step skills, a lightweight structure is acceptable.

### Policy Layer (`SKILL.md`)
- Scope: intent, constraints, success criteria, boundaries.
- Must not depend on brittle UI details.
- Should remain stable across implementation rewrites.

### Strategy Layer (`references/*.md`)
- Scope: workflow map, decision points, fallback policy, quality gates.
- Can describe likely page variants and semantic cues.
- Should avoid hard-binding to per-run refs.

### Execution Layer (`scripts/*.ts`)
- Scope: concrete automated implementation and runtime glue.
- Scripts may be deterministic trajectory executors, policy executors (strategy cache), or helper utilities.
- Policy executor means:
  - keep a stable orchestration skeleton (stage detection, guards, verification),
  - allow bounded semantic inference per step (candidate sets + fallbacks),
  - avoid full per-run re-planning unless recovery is needed.
- Any script is replaceable when UI drifts; the policy layer remains the stable source of intent.
- Current decomposition:
  - `core.ts`: shared browser/runtime primitives
  - `stage-detector.ts`: page/stage inference and navigation recovery
  - `publisher.ts`: review/publish actions and required-field handling
  - `verifier.ts`: post-publish business-state validation
  - `executor.ts`: orchestration only

### Execution Asset Taxonomy

- Deterministic trajectory script:
  - replay-oriented, low inference, high fragility.
- Policy executor / strategy cache:
  - pattern-oriented, bounded inference, balanced robustness and speed.
- Fully deliberative run:
  - inference-oriented, high adaptability, highest variance.

For this skill, treat `executor.ts` as a policy executor rather than a pure trajectory replay.

## 2) Execution Model

1. Run fast path from executor.
2. On structural failure, switch to semantic re-discovery in the same run.
3. Retry with bounded alternatives.
4. Validate business outcome in list state (`Published`/`Draft`).
5. Return success only after outcome validation.

## 3) Semantic Interaction Standards

- First priority: role + accessible name.
- Second priority: visible text candidates.
- Third priority: label/placeholder-driven form fills.
- Last resort: generic file-input fallback for upload wrappers.
- Never rely on static coordinates or positional indexes.

## 4) Publish Correctness Standards

- Treat review-step required fields as blockers.
- If immediate/schedule controls are visible (for example `Now` / `Schedule`), explicitly set the intended mode before publish.
- Do not assume defaults are applied unless state confirms it.
- Post-publish verification must include:
  - title exists in `Published`,
  - title not present in `Draft`.

## 5) Logging and Diagnostics

- Log stage transitions (`upload`, `details`, `review`, `publish`, `verify`).
- On failure, capture screenshot and include semantic context in errors.
- Prefer actionable error messages over generic timeouts.

## 6) Quality and Taste

- Keep policy text concise and conceptual.
- Keep strategy text decision-oriented (why/when), not implementation-heavy.
- Keep scripts modular and replaceable.
- Optimize for maintainability over one-off hacks.
