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
- `Policy executor (strategy cache)` (current reliability baseline)
  - Fixed orchestration skeleton with semantic candidate selection and fallback.
  - Reduces repeated reasoning while retaining bounded adaptation to UI changes.
- `Fully deliberative run`
  - Runtime-first semantic re-discovery with little pre-structured flow.
  - Most adaptive but highest variance in speed/cost.

This skill uses unified runtime by design: D1 deterministic acceleration first, then D2 policy executor fallback for reliability.
The deterministic first-level cache script is available at `scripts/deterministic.ts` with CLI wrapper `scripts/run_deterministic.ts`.

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

- Default unified mode: run D1 first, then auto-downgrade to D2.
  - D1 (`scripts/deterministic.ts`) is optional acceleration only.
  - D2 (`scripts/executor.ts`) is mandatory reliability baseline and must succeed independently.
- If D1 fails:
  - continue with D2 in the same run,
  - record D1 failure context for later D1 optimization.
- If D2 fails:
  - prioritize D2 repair and retry until business-success criteria pass,
  - optimize D1 only after D2 success.

## Resources

- Architecture and standards: `references/architecture.md`
- Workflow map and semantic action plan: `references/plan.md`
- Unified D1->D2 entry: `scripts/auto-executor.ts`
- Executor orchestration entry: `scripts/executor.ts`
- Deterministic first-level cache entry: `scripts/deterministic.ts`
- Stage detection module: `scripts/stage-detector.ts`
- Publish module: `scripts/publisher.ts`
- Verification module: `scripts/verifier.ts`
- Shared core runtime module: `scripts/core.ts`
- CLI wrapper: `scripts/run.ts`
- Deterministic CLI wrapper: `scripts/run_deterministic.ts`
- Regression checks: `tests/test_regression.sh`
