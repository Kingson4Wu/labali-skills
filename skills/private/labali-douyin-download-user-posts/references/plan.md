# Workflow Plan

1. Start or reuse Chrome with CDP:
   - `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-labali"`
2. Connect browser via CDP.
3. Open Douyin user URL, or reuse already-open target user homepage tab, then wait for stabilization.
4. If login is required, pause and wait for manual login in same session.
5. Scroll timeline and collect post cards.
6. If `collect_links_only=true`:
   - collect canonical post detail links from timeline (`/video/{id}` + `/note/{id}`),
   - write `post_links.json` and `post_links.txt`,
   - stop without opening detail tabs or downloading assets.
7. For each post:
   - Open post detail in a temporary tab (batch mode), keep homepage tab unchanged.
   - Extract target-post text/time (prefer JSON `desc` + `create_time`).
   - Resolve media URLs from detail DOM + captured responses.
   - Download media files and consolidate to one final video file when applicable.
   - Write `post.md`, close temporary tab, continue next post.
7. Return counts and failure summary.

## Notes

- Use semantic signals first (`aria-label`, visible labels, stable text anchors).
- Avoid brittle CSS selector chains when possible.
- Keep stop conditions bounded to avoid infinite scroll loops.
- If `fixed_user_dir` is provided, always write into that folder.
