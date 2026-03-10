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
  - `auto-executor.ts`: unified deterministic->policy orchestration and fallback recording
  - `deterministic.ts`: deterministic trajectory cache
  - `core.ts`: shared browser/runtime primitives
  - `stage-detector.ts`: page/stage inference and navigation recovery
  - `deleter.ts`: draft-delete actions and loop
  - `verifier.ts`: post-delete business-state validation
  - `executor.ts`: policy executor orchestration

### Execution Asset Taxonomy

- Deterministic trajectory script:
  - replay-oriented, low inference, high fragility.
- Policy executor / strategy cache:
  - pattern-oriented, bounded inference, balanced robustness and speed.
- Fully deliberative run:
  - inference-oriented, high adaptability, highest variance.

For this skill, treat `executor.ts` as a policy executor rather than a pure trajectory replay.

## 2) Execution Model

1. Run deterministic trajectory cache as optional fast path.
2. On deterministic failure, auto-downgrade to policy executor in the same run.
3. If policy executor fails, repair policy first and retry in-loop until business success criteria pass.
4. Record deterministic failure context and policy recovery outcome for later deterministic optimization.
5. Validate business outcome by mode:
   - default mode: one Draft delete completed;
   - full-cleanup mode: `Draft` empty.
6. Only after successful completion, feed policy-success evidence back to deterministic optimization.

## 3) Semantic Interaction Standards

- First priority: role + accessible name.
- Second priority: visible text candidates.
- Third priority: placeholder-driven filtering.
- Last resort: bounded JS fallback in deterministic mode only.
- Never rely on static coordinates or positional indexes.

## 4) Delete Correctness Standards

- Always switch to `Draft` filter before deletion.
- Treat delete confirmation dialogs as blockers.
- Default mode deletes only the first Draft entry.
- Full-cleanup mode continues deletion loop until no deletable Draft entry remains.
- Full-cleanup mode verification must confirm no Draft episodes remain in the target show.

## 5) Logging and Diagnostics

- Log stage transitions (`entry`, `target-show`, `draft-filter`, `delete-loop`, `verify`).
- On failure, capture screenshot and include semantic context in errors.
- Prefer actionable error messages over generic timeouts.

## 6) Quality and Taste

- Keep policy text concise and conceptual.
- Keep strategy text decision-oriented (why/when), not implementation-heavy.
- Keep scripts modular and replaceable.
- Optimize for maintainability over one-off hacks.
