# Workflow Plan

## Stage 1: Browser Session
- Launch or reuse Chrome by:
  `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-labali"`.
- Connect through CDP (default `9222`).
- Open Xiaohongshu home page first (`https://www.xiaohongshu.com`).
- If login state is detected, guide user to login manually in the opened window.

## Stage 2: Inputs
- Read `post_url` and `output_dir` from CLI flags.
- If `post_url` is missing, prompt user interactively after login check.
- If `output_dir` is missing, prompt user with default `./downloads/xhs`.
- Resolve absolute output path.
- Resolve persistent profile directory.

## Stage 3: Post Open
- Normalize URL to canonical `/explore/<note_id>` form.
- Open target post URL and wait for page load.

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
