---
name: labali-xiaohongshu-download-post-assets
description: Download Xiaohongshu post assets to a specified local directory using browser-only automation with manual-login session reuse. Use when tasks require guided flow: open browser, guide login if needed, ask for post URL, normalize URL to /explore/<note_id>, save post images, generate post.md, download video when available, and optionally export post comments.
license: MIT
compatibility: macOS / Linux; requires Chrome with remote-debugging enabled (default port 9222) and an authenticated Xiaohongshu session; Node.js ≥ 18 + tsx; internet access required.
allowed-tools: "Bash(npx:*), Bash(pnpm:*)"
metadata:
  pattern: pipeline
---

# labali-xiaohongshu-download-post-assets

Treat this skill as a layered system, not a single script.

## Layer Contract

1. `SKILL.md` (this file) is the policy layer.
   - Define goals, constraints, success criteria, and decision boundaries.
   - Stay semantic and stable across UI changes.
2. `references/architecture.md` is the strategy layer.
   - Define execution model, failure handling, and quality standards.
3. `scripts/*.ts` is the execution layer.
   - Scripts are execution assets, not the skill definition itself.
   - Use persistent browser profile for manual-login reuse.
   - Keep download and extraction logic modular and replaceable.

## Required Constraints

- Use browser automation only.
- Do not use Xiaohongshu private APIs.
- Reuse manual-login session via unified Chrome CDP startup:
  `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-labali"`.
- Prefer semantic extraction from visible page state and loaded resources.
- Download only target post assets: images plus optional post video.
- Generate `post.md` for extracted text metadata.
- Export comments only when `include_comments=true`, and write `comments/comments.json` + `comments/comments.md`.
- Download comment images into `comments/images/`.
- Treat comment export as best-effort (not a fully reliable/comprehensive feature).
- Do not generate `manifest.json`.
- If multiple video segments are downloaded, merge them into one file and delete segment files.
- Normalize post URL to canonical format: `https://www.xiaohongshu.com/explore/<note_id>`.

## NEVER

- Never leave multiple video segment files in the output folder after a successful run — merge segments and delete the originals.
- Never report success if `post.md` was not generated.
- Never report success based on action completion alone — verify output folder structure and required files exist.

## Success Criteria

A run is successful only when all conditions hold:

1. A post output folder is created under the specified local directory.
2. Folder naming format is `<publish_time>-<note_id>`.
3. `post.md` is generated in the folder.
4. Post image files are saved in the folder.
5. Post video files are saved when the post contains video.
6. If multiple video files are generated, they are merged into one and segment files are removed.
7. When `include_comments=true`, comments are exported under `comments/` with `comments.json` and `comments.md`.
8. When comment images exist, they are downloaded under `comments/images/`.
9. URL output and logs use canonical `/explore/<note_id>` form without token query.

Comment export quality note:
- Even when execution succeeds, comment coverage and hierarchy/reply linking can be partial due to page-side rendering and loading variability.

## Runtime Inputs

Use `skill.yaml` as the source of truth for input schema.

## Operational Mode

- Default mode: guided browser flow + semantic extraction + authenticated media download.
- Optional mode: add semantic comment extraction, comment image download, and write `comments/comments.json` + `comments/comments.md` when `include_comments=true`.
- Startup guidance:
  - launch/reuse Chrome by the unified `open -na "Google Chrome"` CDP command,
  - connect via CDP port,
  - open Xiaohongshu home page first,
  - check whether login is required,
  - if required, guide user to complete manual login in the same window,
  - if already logged in, skip login wait.
- Input guidance:
  - after startup/login check, if `post_url` is missing, prompt user to input post URL interactively,
  - if `output_dir` is missing, prompt user to input target folder (with default).
- If login is required:
  - keep browser open,
  - ask user to complete login manually,
  - continue in the same session after confirmation.
- On partial download failures:
  - keep successfully downloaded files,
  - return result with explicit failure count.

> If failure handling or extraction decisions are unclear, load `references/architecture.md`.
> If extraction or comment export strategy is unclear, load `references/plan.md`.

## Resources

- Architecture and standards: `references/architecture.md`
- Workflow map and extraction plan: `references/plan.md`
- Shared runtime and downloader helpers: `scripts/core.ts`
- Main orchestration: `scripts/executor.ts`
- CLI entry: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
