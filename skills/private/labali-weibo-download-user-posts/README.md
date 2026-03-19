# labali-weibo-download-user-posts Usage

This skill downloads all posts and media from a Weibo user profile using browser automation with manual-login session reuse.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-weibo-download-user-posts
```

Update to latest version: run the install command again.

## 2) Quick Start

```bash
npx tsx skills/private/labali-weibo-download-user-posts/scripts/run.ts \
  --user_url "https://weibo.com/u/<uid>" \
  --output_dir "/absolute/output/dir"
```

Optional flags:
- `--profile_dir ~/.chrome-labali`
- `--cdp_port 9222`
- `--timeout_ms 180000`
- `--overwrite true|false`
- `--max_posts 50` (0 = no cap)
- `--include_videos true|false`

If `user_url` or `output_dir` is omitted, the script prompts interactively.

## 3) Runtime Flow

1. Launch/reuse Chrome with CDP (`open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=~/.chrome-labali`).
2. Connect via CDP.
3. Open target user profile page.
4. Check login state; if required, pause and wait for manual login.
5. Scroll timeline and click visible expansion controls until no new posts appear.
6. Extract post text and media links from visible page state and loaded resources.
7. Download images and optional videos.
8. Write per-post `post.md`, plus top-level `posts.json` and `user.md`.
9. Create output folder named `<timestamp>-<user_slug>`.
10. Keep partial results: already-downloaded files are kept even if later posts fail.

## 4) Output Structure

```text
<output_dir>/
  <timestamp>-<user_slug>/
    user.md
    posts.json
    <post_id>/
      post.md
      images/
        001.jpg
        002.jpg
      videos/
        video.mp4
```

## 5) Prerequisites

- Node.js with `tsx`
- Playwright (`npm install playwright`)
- Google Chrome installed
- Logged-in Weibo session in `~/.chrome-labali`

## 6) Limitations

1. **Login required** — manual login must be completed in the reused Chrome profile before extraction begins.
2. **Timeline pagination** — relies on scroll-based lazy loading; very large timelines may hit `timeout_ms`.
3. **Platform changes** — extraction logic is semantic but may break on major Weibo UI overhauls.
4. **Video availability** — some videos may be region-locked or require higher-tier login.

## 7) Troubleshooting

- If posts are missing: confirm Chrome is logged in to Weibo, then re-run.
- If videos are skipped: check `--include_videos true` is set and login session is active.
- If run times out: increase `--timeout_ms` or reduce `--max_posts`.
- If output contains stale files: re-run with `--overwrite true`.
