---
name: labali-xiaohongshu-download-post-assets
description: Download XiaoHongShu (XHS / xiaohongshu) post assets — images, video, text metadata — to a local folder using browser automation with manual-login session reuse. Use when downloading a XHS post, saving post images, exporting post content, or archiving a note. Trigger phrases: "download xhs", "xiaohongshu post", "xhs images", "save post", "xhs note", "xiaohongshu download".
license: MIT
allowed-tools: "Bash(npx:*), Bash(pnpm:*)"
metadata:
  pattern: pipeline
  compatibility: "macOS / Linux; requires Chrome with remote-debugging enabled (port 9222) and authenticated XiaoHongShu session; Node.js ≥ 18 + tsx"
---

# labali-xiaohongshu-download-post-assets

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
- Preserve all original query parameters (especially `xsec_token`, `xsec_source`, `share_id`) for page navigation — Xiaohongshu uses these tokens to render authenticated content; stripping them causes incomplete page rendering (wrong image count, missing text).
- Normalize post URL to canonical format (`https://www.xiaohongshu.com/explore/<note_id>`) for output only: folder naming, `post.md` source field, and logs. Do not strip params before navigating.

## Anti-Detection Principles

XiaoHongShu applies behavioral analysis to detect automation. Every interaction must mimic how a real user browses. Violations of these principles have caused account rate-limiting in the past — do not remove or bypass them.

**Navigation:**
- If the tab is already on the target post URL, skip `page.goto()` entirely — re-navigating an already-open post is an unnatural action and a clear bot signal.
- All fixed `waitForTimeout` values must be randomized (e.g., `base + Math.random() * range`) — deterministic delays are a bot fingerprint.
- After navigating to a post, scroll down briefly to simulate reading the text, then scroll back up before interacting with images.

**Image acquisition:**
- Never issue new HTTP requests for images — the browser has already downloaded them.
- Capture images via `page.on("response")` during carousel click-through, or read from browser HTTP cache via `fetch(url, {cache: "force-cache"})` inside `page.evaluate()`.
- If neither path yields the image data, report failure — do not fall back to `page.request.get()` or any out-of-browser HTTP request.
- Click through carousel images one by one with randomized delays (700–1400ms per image), not batch-extracted from the DOM.

**Video:**
- Before downloading, simulate user engagement: bring the tab to front, click the video/play button, wait 3–5 seconds for buffering.
- Video download still uses `page.request.get()` (stream content is not fully cached); the play simulation above is what makes this behaviorally acceptable.

**General:**
- Always operate within the user's authenticated Chrome session (CDP reuse) — never launch a headless or separate browser.
- Never read `window.__INITIAL_STATE__` or manipulate the DOM in ways that go beyond what a user's own browser JS would do.

## NEVER

- Never leave multiple video segment files in the output folder after a successful run — merge segments and delete the originals.
- Never report success if `post.md` was not generated.
- Never report success based on action completion alone — verify output folder structure and required files exist.
- **Never strip xsec_token or share params before navigating** — XiaoHongShu uses these tokens server-side to render authenticated content; a URL without them silently produces wrong image counts and missing text, with no error.
- **Never launch a new Chrome instance if CDP is already responding on port 9222** — launching a second instance creates a separate session, loses the authenticated profile, and forces re-login.
- **Never take over a non-XiaoHongShu browser tab** — if an existing XHS tab is found, reuse it by navigating it to the post URL; if no XHS tab exists, open a new tab. Never hijack tabs belonging to other pages (e.g., Gmail, dev tools). The correct behavior is always: XHS tab → navigate it to post URL; no XHS tab → open new tab.
- **Never issue new outbound HTTP requests for post images** — use response interception or browser cache reads only; falling back to `page.request.get()` for images is a bot signal.
- **Never use fixed (non-randomized) delays** — deterministic timing is a bot fingerprint; all waits must include a random component.

## Success Criteria

A run is successful only when all conditions hold:

1. A post output folder is created under the specified local directory.
2. Folder naming format is `<download_date>-<sanitized_title>-<note_id>` (title omitted when empty); `<download_date>` is today's date (YYYYMMDD), not the post's publish time.
3. `post.md` is generated in the folder.
4. Post image files are saved in the folder.
5. Post video files are saved when the post contains video.
6. If multiple video files are generated, they are merged into one and segment files are removed.
7. When `include_comments=true`, comments are exported under `comments/` with `comments.json` and `comments.md`.
8. When comment images exist, they are downloaded under `comments/images/`.
9. URL output and logs use canonical `/explore/<note_id>` form without token query.

Comment export quality note:
- Even when execution succeeds, comment coverage and hierarchy/reply linking can be partial due to page-side rendering and loading variability.

## Operational Mode

- Default mode: guided browser flow + semantic extraction + authenticated media download.
- Optional mode: add semantic comment extraction, comment image download, and write `comments/comments.json` + `comments/comments.md` when `include_comments=true`.
- Startup guidance:
  - if Chrome with remote debugging is already running on the CDP port, reuse it — do not launch a new instance,
  - connect via CDP port,
  - if an existing Xiaohongshu tab is found, reuse it — do not open a new tab or navigate away from any other active tab,
  - if no Xiaohongshu tab exists, open a new tab,
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

## Resources

| When | Must load | Do NOT load |
|------|-----------|-------------|
| Always — at skill invocation start | `references/plan.md` | `references/architecture.md` |
| Extraction returns wrong count or fails | `references/architecture.md` | — |
| Video merge or comment export unclear | `references/architecture.md` | — |

**MANDATORY — load `references/plan.md` immediately when this skill is invoked**, before any browser or extraction action begins.
