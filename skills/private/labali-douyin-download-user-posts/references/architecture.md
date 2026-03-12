# Architecture

## Layered Boundaries

- Policy layer: `SKILL.md`
- Strategy layer: `references/*.md`
- Execution layer: `scripts/*.ts`

Keep policy stable, strategy explicit, and execution replaceable.

## Execution Model

1. Ensure Chrome remote debugging endpoint is available.
2. Connect via CDP (agent-browser style through Playwright CDP transport).
3. Reuse authenticated browser profile.
4. Open Douyin user page and verify login state.
5. Reuse current user homepage tab when available; for batch mode, process each post in a temporary detail tab and close it after completion.
6. Extract posts with semantic selectors and network-backed media discovery.
7. Download assets and write per-post outputs.

## Failure Handling

- Fail fast on missing required runtime inputs.
- Keep partial success for media downloads.
- Record all failed URLs with explicit error strings.
- Prefer homepage reuse and minimal navigation to reduce risk-control triggers.

## Download Correctness Standards

- Deduplicate URLs by normalized origin+path keys.
- Preserve source post order in `posts.json`.
- Write deterministic per-post folders with stable naming.
- Prefer target-post JSON `desc`/`create_time` for text and publish time.
- Keep only one final video file per post after consolidation/muxing.
