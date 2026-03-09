---
name: labali-spotify-publish-episode
description: Publish podcast episodes on Spotify for Creators using browser-only semantic automation with manual-login session reuse. Use when tasks require creating or continuing an episode draft, uploading audio, filling metadata, and publishing/scheduling from creators.spotify.com without APIs.
---

# labali-spotify-publish-episode

Treat this skill as a layered system, not a single script.

## Layer Contract

1. `SKILL.md` (this file) is the policy layer.
   - Define goals, constraints, success criteria, and decision boundaries.
   - Stay semantic and stable across UI changes.
2. `references/architecture.md` is the strategy layer.
   - Define execution model, failure handling, and quality standards.
3. `scripts/*.ts` is the execution layer.
   - Scripts are execution assets, not the skill definition itself.
   - Prefer a policy-executor (strategy cache): reusable stage logic + bounded semantic decisions.
   - Deterministic trajectory scripts are valid for simple stable pages, but not required.
   - Any execution script can become stale and should be replaceable.

## Script Classification

- `Deterministic trajectory script`
  - Fixed UI path replay with minimal runtime inference.
  - Best for stable UI, fastest when valid, most brittle under UI drift.
- `Policy executor (strategy cache)` (current skill)
  - Fixed orchestration skeleton with semantic candidate selection and fallback.
  - Reduces repeated reasoning while retaining bounded adaptation to UI changes.
- `Fully deliberative run`
  - Runtime-first semantic re-discovery with little pre-structured flow.
  - Most adaptive but highest variance in speed/cost.

This skill uses the second model by design.

## Required Constraints

- Use browser automation only.
- Do not use Spotify APIs.
- Use semantic interactions first (visible text, label, role).
- Login is manual; session reuse is required.
- Publish success is validated by business state, not by click success.

## Success Criteria

A run is successful only when all conditions hold:

1. The target episode title appears in `Published`.
2. The same title does not appear in `Draft`.
3. No required publish controls remain unresolved in review step.

## Runtime Inputs

Use `skill.yaml` as the source of truth for input schema.

## Operational Mode

- Prefer fast-path execution through `scripts/executor.ts`.
- If fast-path fails or post-publish validation fails:
  - re-enter semantic exploration,
  - infer updated controls from current UI,
  - retry with bounded self-healing,
  - and only then return success/failure.

## Resources

- Architecture and standards: `references/architecture.md`
- Workflow map and semantic action plan: `references/plan.md`
- Executor orchestration entry: `scripts/executor.ts`
- Stage detection module: `scripts/stage-detector.ts`
- Publish module: `scripts/publisher.ts`
- Verification module: `scripts/verifier.ts`
- Shared core runtime module: `scripts/core.ts`
- CLI wrapper: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
