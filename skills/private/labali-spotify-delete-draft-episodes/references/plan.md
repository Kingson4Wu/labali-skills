# Semantic Workflow Plan

## Workflow Outline

1. Entry and auth
- Open creators domain or reuse existing creators tab.
- If logged out, route through login entry and wait for manual auth completion.

2. Show targeting
- Open target show directly by `show_id` derived episodes URL.
- Reuse current show context when URL already matches.

3. Draft list stage detection
- Detect whether current page is in the show episodes list.
- Ensure `Draft` filter is active before any delete action.

4. Draft deletion loop
- Locate first deletable Draft item using semantic controls.
- Trigger row actions and execute delete + confirmation.
- Default mode: stop after deleting the first Draft item.
- Full-cleanup mode (`delete_all_drafts=true`): repeat with bounded retries until no Draft item remains or safety cap reached.

5. Outcome verification
- Default mode: verify one delete action completed.
- Full-cleanup mode: reload Draft filter list and confirm no Draft episodes remain.
- In full-cleanup mode, if verification fails, return failure regardless of intermediate click success.

## Self-Healing Triggers

- Missing expected action labels (`More options`, `Delete`, confirmation).
- UI transitions that do not return to Draft list after delete.
- Deletion appears to run but final Draft list is not empty.

## Preferred Recovery Order

1. Re-snapshot and re-evaluate stage.
2. Retry with semantic candidate alternatives.
3. Refresh and re-enter Draft filter.
4. Re-run delete loop and verification checks.

## Execution Mode Note

- Unified runtime order:
  1. Deterministic trajectory cache (`deterministic.ts`)
  2. Auto-downgrade to policy executor (`executor.ts`) if deterministic path fails
- Optional direct policy mode: set `disable_deterministic_cache=true` when validating baseline behavior or when deterministic path is environment-limited.
- Policy executor remains the required baseline capability; deterministic mode is optional acceleration.
- If policy executor fails, repair and retry until Draft-empty verification passes.
- Log deterministic failure context and use policy-success evidence to iteratively improve deterministic mode after task success.
