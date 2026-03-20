---
name: labali-spotify-delete-draft-episodes
description: Delete Draft-status podcast episodes for a specified Spotify show_id on creators.spotify.com using browser-only semantic automation with manual-login session reuse. Use when tasks need Draft cleanup without APIs: default behavior deletes only the first Draft episode, and optional full-cleanup mode deletes all Draft episodes.
license: MIT
compatibility: macOS / Linux; requires agent-browser CLI in PATH, Chrome with remote-debugging enabled (default port 9222), and an authenticated Spotify for Creators session; Node.js ≥ 18 + tsx; internet access required.
---

# labali-spotify-delete-draft-episodes

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

This skill uses unified runtime by design: deterministic trajectory cache first, then policy executor fallback for reliability.
The deterministic first-level cache script is available at `scripts/deterministic.ts` with CLI wrapper `scripts/run_deterministic.ts`.

## Required Constraints

- Use browser automation only.
- Do not use Spotify APIs.
- Use semantic interactions first (visible text, label, role).
- Login is manual; session reuse is required.
- Deletion success is validated by business state, not by click success.
- Scope deletions to `Draft` filter only.

## Success Criteria

A run is successful only when all conditions hold:

1. The target show is selected by `show_id`/show URL.
2. At least one Draft episode is deleted in default mode (`delete_all_drafts=false`).
3. In full-cleanup mode (`delete_all_drafts=true`), final check confirms no `Draft` episodes remain.

## Runtime Inputs

Use `skill.yaml` as the source of truth for input schema.

## Operational Mode

- Delete mode:
  - Default: `delete_all_drafts=false` deletes only the first Draft episode.
  - Full cleanup: set `delete_all_drafts=true` to delete all Draft episodes (bounded by `max_delete`).
- Default unified mode: run deterministic trajectory cache first, then auto-downgrade to policy executor.
  - Deterministic trajectory cache (`scripts/deterministic.ts`) is optional acceleration only.
  - Policy executor (`scripts/executor.ts`) is mandatory reliability baseline and must succeed independently.
  - Set `disable_deterministic_cache=true` (or CLI `--disable_deterministic_cache true`) to skip deterministic mode and run policy executor directly.
- If deterministic trajectory cache fails:
  - continue with policy executor in the same run,
  - record deterministic failure context for later optimization.
- If policy executor fails:
  - prioritize policy repair and retry in a loop until business-success criteria pass,
  - do not return success before verification passes.
- After task completion:
  - use deterministic failure records plus policy-success evidence to optimize deterministic mode incrementally,
  - keep deterministic mode optional; never weaken policy baseline for speed-only changes.

## Resources

- Architecture and standards: `references/architecture.md`
- Workflow map and semantic action plan: `references/plan.md`
- Unified deterministic->policy entry: `scripts/auto-executor.ts`
- Executor orchestration entry: `scripts/executor.ts`
- Deterministic first-level cache entry: `scripts/deterministic.ts`
- Stage detection module: `scripts/stage-detector.ts`
- Draft deletion module: `scripts/deleter.ts`
- Verification module: `scripts/verifier.ts`
- Shared core runtime module: `scripts/core.ts`
- CLI wrapper: `scripts/run.ts`
- Deterministic CLI wrapper: `scripts/run_deterministic.ts`
- Regression checks: `tests/test_regression.sh`
