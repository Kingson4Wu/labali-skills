# Architecture and Standards

## 1) Layered Boundaries

### Policy Layer (`SKILL.md`)
- Scope: intent, constraints, success criteria, boundaries.
- Keep stable even when page structure changes.

### Strategy Layer (`references/*.md`)
- Scope: workflow map, extraction heuristics, fallback rules.
- Document why decisions are made, not low-level selectors only.

### Execution Layer (`scripts/*.ts`)
- Scope: Chrome CDP startup/reuse, browser connection, post extraction, and authenticated asset downloads.
- Current decomposition:
  - `core.ts`: URL parsing, content extraction, media detection, file writing.
  - `executor.ts`: full workflow orchestration and retry path after manual login.
  - `run.ts`: CLI argument parsing and execution.

## 2) Execution Model

1. Launch/reuse Chrome with:
   `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-labali"`.
2. Connect to Chrome through CDP (`http://127.0.0.1:9222` by default).
3. Open Xiaohongshu home page first as login warmup.
4. If home page indicates login-required state, pause and guide manual login in the same browser window.
5. Resolve `post_url`/`output_dir` from CLI or interactive prompts.
6. Open canonical target post URL (`/explore/<note_id>` without token query).
7. Extract post publish time, text, image URLs, and optional video URLs from post state/DOM.
8. If post page is still login-gated, pause and request manual login, then retry extraction.
9. Download images and optional video via browser-authenticated request context.
10. If multiple video files are downloaded, merge into one output video and delete segment files.
11. Write `post.md` in output folder.
12. Name output folder as `<publish_time>-<note_id>`.

## 3) Extraction Standards

- Prefer visible content and standard metadata (`og:title`, `description`).
- Combine DOM and network capture to reduce misses.
- Deduplicate URLs aggressively before downloading.
- Keep robust URL filtering to avoid avatars/icons/trackers.

## 4) Download Correctness Standards

- Use authenticated browser request context for media fetch.
- Infer file extensions from response content-type first, URL second.
- Keep deterministic file naming (`001.*`, `002.*`, `video-001.*`, ...), and produce `video-merged.mp4` after merge when segmented videos exist.
- Keep only post assets; exclude APIs, avatars, icons, and non-media responses.

## 5) Logging and Diagnostics

- Log stage transitions: open, extract, login-wait, download, finalize.
- Emit final counts: discovered, downloaded, failed.
- Keep failure messages actionable.
