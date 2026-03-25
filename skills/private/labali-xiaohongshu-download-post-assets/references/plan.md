# Workflow Plan

## Stage 1: Browser Session
- Check if Chrome with remote debugging is already running on the CDP port (`http://127.0.0.1:<port>/json/version`).
  - If already running: reuse the existing instance — do not launch a new Chrome process.
  - If not running: launch with `open -na "Google Chrome" --args --remote-debugging-port=<port> --user-data-dir=<profile_dir>`.
- Connect through CDP.
- Check existing tabs for any `xiaohongshu.com` page:
  - If found: reuse that tab — do not navigate away from other open tabs.
  - If not found: open a new tab.
- Check login state; if login required, guide user to complete manual login in the current window.

## Stage 2: Inputs
- Read `post_url` and `output_dir` from CLI flags.
- If `post_url` is missing, prompt user interactively after login check.
- If `output_dir` is missing, prompt user with default `./downloads/xhs`.
- Resolve absolute output path.
- Resolve persistent profile directory.

## Stage 3: Post Open
- Extract `note_id` from the input URL for folder naming and output metadata.
- Navigate using the **original URL** with all query parameters preserved — `xsec_token` and related share params are required for Xiaohongshu to render authenticated content; a URL without them may produce incomplete image sets and missing text.
- Canonical form (`/explore/<note_id>` only) is used for output fields (folder name, `post.md` source URL, logs) — not for navigation.
- Wait for page load.

## Stage 4: Extraction
- Extract post publish time.
- Extract post text and post image candidates.
- Extract optional post video URL when available.
- If `include_comments=true`, extract comments (state-first, DOM fallback).

## Stage 5: Login Recovery
- Detect likely login-gated page state.
- Prompt user to manually login in current browser window.
- Retry extraction in same session.

## Stage 6: Downloads
- Create output folder: `<publish_time>-<note_id>`.
- Download post images into this folder.
- Download post video into this folder when available.
- If multiple video segments exist, merge into one video file and remove segment files.
- If `include_comments=true`, download comment images into `comments/images/`.

## Stage 7: Outputs
- Write `post.md`.
- If `include_comments=true`, write `comments/comments.json` and `comments/comments.md`.
- Return summary counts and output paths (no `manifest.json`).
