# Semantic Workflow Plan

## Workflow Outline

1. Entry and auth
- Open creators domain or reuse existing creators tab.
- If logged out, route through login entry and wait for manual auth completion.

2. Show targeting
- Reuse current show context when URL or page state confirms match.
- Otherwise resolve show by semantic show name actions.

3. Episode stage detection
- Detect whether current page is:
  - episode list,
  - upload/details wizard,
  - review/publish step.
- Continue from current stage instead of restarting blindly.

4. Media and metadata
- Upload audio via semantic upload controls; fallback to generic file input only when wrappers block direct upload.
- Fill title and description with native input first (focus/select-all/insert text), then semantic and DOM fallbacks.
- Optionally upload cover image.

5. Review and publish
- Advance wizard with `Next` until publish controls are available.
- Satisfy required publish-date controls when present.
- Publish now by default (unless caller disables final publish).

6. Outcome verification
- Verify title appears in `Published` filter.
- Verify same title does not appear in `Draft` filter.
- If verification fails, return failure regardless of click outcomes.

## Self-Healing Triggers

- Missing expected control labels.
- UI transitions that do not produce expected next-stage markers.
- Publish action clicked but list-state verification fails.

## Preferred Recovery Order

1. Re-snapshot and re-evaluate stage.
2. Retry with semantic candidate alternatives.
3. Use bounded fallback paths for upload/editor quirks.
4. Re-run publish and verification checks.

## Execution Mode Note

- Unified runtime order:
  1. Deterministic trajectory cache (`deterministic.ts`)
  2. Auto-downgrade to policy executor (`executor.ts`) if deterministic path fails
- Optional direct policy mode: set `disable_deterministic_cache=true` when validating baseline behavior or when deterministic path is environment-limited.
- Policy executor remains the required baseline capability; deterministic mode is optional acceleration.
- If policy executor fails, repair and retry until publish verification passes.
- Log deterministic failure context and use policy-success evidence to iteratively improve deterministic mode after task success.
