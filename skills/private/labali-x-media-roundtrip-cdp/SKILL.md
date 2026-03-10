---
name: labali-x-media-roundtrip-cdp
description: Re-encode social media media assets through browser-only X workflow using agent browser + Chrome CDP session reuse: upload local media, publish temporary post, capture media URL from posted item, download processed media to local output path, then delete the temporary post. Use when users want third-party-style browser roundtrip processing without API usage.
---

# labali-x-media-roundtrip-cdp

Treat this skill as a layered system.

## Layer Contract

1. `SKILL.md` is the policy layer.
2. `references/architecture.md` is the strategy layer.
3. `scripts/run.ts` and `scripts/launch-chrome-cdp.sh` are the execution layer.

## Required Constraints

- Use browser automation only (agent browser + CDP).
- Do not use X/Twitter API SDK.
- Start Chrome with this exact pattern when CDP is unavailable:
  - `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-private"`
- Automatically precheck runtime state before task execution:
  - check Chrome CDP endpoint and launch only when needed,
  - check whether X page is open and open it when needed,
  - check login status and trigger login flow when needed.
- Follow strict workflow order:
  1. Upload media from local file path.
  2. Publish temporary post.
  3. Read posted media URL.
  4. Download media to local output file.
  5. Delete temporary post.
- Confirm deletion before success response.

## Success Criteria

A run is successful only when all conditions hold:

1. Runtime precheck confirms CDP, X page, and login are ready.
2. Temporary post is published and media URL is captured.
3. Processed media is downloaded to output file path.
4. Temporary post is deleted.
5. Final output includes media URL, output path, and deletion confirmation.

## Runtime Inputs

Use `skill.yaml` as input schema source of truth.

## Operational Mode

- Manual-login session reuse is required.
- Deterministic local control with browser + CDP only.
- No remote service APIs.

## Resources

- Architecture: `references/architecture.md`
- Workflow plan: `references/plan.md`
- CDP launcher: `scripts/launch-chrome-cdp.sh`
- CLI wrapper: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
