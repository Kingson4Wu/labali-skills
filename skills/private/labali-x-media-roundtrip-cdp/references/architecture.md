# Architecture

## Layered Boundaries

- Policy layer: `SKILL.md`
- Strategy layer: this file + `references/plan.md`
- Execution layer: `scripts/run.ts` + `scripts/launch-chrome-cdp.sh`

## Execution Model

1. Check CDP endpoint state and launch Chrome only if endpoint is not ready.
2. Connect to Chrome over CDP.
3. Check X page state and open X home when missing.
4. Check login state; if not logged in, navigate login flow and continue after login is complete.
5. Navigate to compose flow on X.
6. Upload media file from local path.
7. Publish temporary post.
8. Resolve posted media URL from post entity/page structure.
9. Download media bytes to output path.
10. Delete temporary post.
11. Verify post deletion and report final artifacts.

## Safety Notes

- This workflow intentionally uses temporary publication as processing step.
- Post deletion verification is mandatory.
- If deletion fails, run must be treated as incomplete.
