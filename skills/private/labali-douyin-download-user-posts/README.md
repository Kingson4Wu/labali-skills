# labali-douyin-download-user-posts Usage

This skill downloads all posts and media from a Douyin user profile using browser automation with manual-login session reuse.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-douyin-download-user-posts
```

Update to latest version: run the install command again.

## 2) Quick Start

```bash
npx tsx skills/private/labali-douyin-download-user-posts/scripts/run.ts \
  --user_url "https://www.douyin.com/user/<uid>" \
  --output_dir "/absolute/output/dir"
```

Optional flags:
- `--profile_dir ~/.chrome-labali`
- `--cdp_port 9222`
- `--timeout_ms 180000`
- `--overwrite true|false`
- `--max_posts 50` (0 = no cap)
- `--include_videos true|false`
- `--collect_links_only true|false`
- `--fixed_user_dir /path/to/existing/user/dir`

If `user_url` or `output_dir` is omitted, the script prompts interactively.

## 3) Runtime Flow

1. Launch/reuse Chrome with CDP (`open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=~/.chrome-labali`).
2. Connect via CDP.
3. Open target user profile page.
4. Check login state; if required, pause and wait for manual login.
5. Scroll timeline continuously until no new posts appear.
6. For each post: open detail in a temporary tab, extract post text and media links, download assets, write `post.md`, close tab.
7. Strip platform-generated suffixes from post text (Douyin share/promotion footers appended after the original post text).
8. Create output folder `<timestamp>-<user_slug>` (or reuse `fixed_user_dir` when provided).
9. Keep partial results: already-downloaded files are kept even if later posts fail.

Links-only mode (`--collect_links_only true`): collect detail links only into `post_links.json` + `post_links.txt`, skip media download.

## 4) Output Structure

```text
<output_dir>/
  <timestamp>-<user_slug>/
    post_links.txt         (links-only mode)
    post_links.json        (links-only mode)
    <post_id>/
      post.md
      images/
        001.jpg
        002.jpg
      videos/
        video.mp4          (one final video per post)
```

## 5) Prerequisites

- Node.js with `tsx`
- Playwright (`npm install playwright`)
- Google Chrome installed
- Logged-in Douyin session in `~/.chrome-labali`

## 6) Limitations

1. **Login required** — manual login must be completed in the reused Chrome profile before extraction begins.
2. **Video extraction** — keeps only one final video file per post (prefers muxed AV or largest valid AV file); partial downloads are discarded.
3. **Timeline pagination** — relies on scroll-based lazy loading; very large timelines may hit `timeout_ms`.
4. **Platform changes** — extraction logic is semantic but may break on major Douyin UI overhauls.

## 7) Troubleshooting

- If posts are missing: confirm Chrome is logged in to Douyin, then re-run.
- If videos are skipped: check `--include_videos true` is set and login session is active.
- If run times out: increase `--timeout_ms` or reduce `--max_posts`.
- To resume an interrupted run: use `--fixed_user_dir` pointing to the existing output folder.
