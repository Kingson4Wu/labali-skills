# labali-xiaohongshu-export-user-post-links Usage

This skill extracts all Xiaohongshu post links from a user profile page and writes them to a local file.

Current output policy:
- Export one post link per line
- Deduplicate links
- Default output includes `xsec_token` and `xsec_source=pc_user`
- Optional canonical mode outputs `https://www.xiaohongshu.com/explore/<note_id>` only
- Optional publish-time mode outputs `publish_time<TAB>url`
- Optional latest-only mode can exclude pinned posts and stop early after enough candidates are found

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-xiaohongshu-export-user-post-links
```

Update to latest version: run the install command again.

## 2) Quick Start

```bash
npx tsx skills/private/labali-xiaohongshu-export-user-post-links/scripts/run.ts \
  --profile_url "https://www.xiaohongshu.com/user/profile/<user_id>?xsec_token=...&xsec_source=pc_search" \
  --output_path "/absolute/output/path/or/dir"
```

Latest two non-sticky posts with publish time:

```bash
npx tsx skills/private/labali-xiaohongshu-export-user-post-links/scripts/run.ts \
  --profile_url "https://www.xiaohongshu.com/user/profile/<user_id>?xsec_token=...&xsec_source=pc_search" \
  --output_path "/absolute/output/path/or/dir" \
  --exclude_sticky true \
  --limit 2 \
  --include_publish_time true
```

Optional flags:
- `--include_token true|false` (default `true`)
- `--include_publish_time true|false` (default `false`)
- `--exclude_sticky true|false` (default `false`)
- `--limit 2`
- `--profile_dir ~/.chrome-labali`
- `--cdp_port 9222`
- `--timeout_ms 90000`
- `--max_scroll_rounds 80`

If `profile_url` or `output_path` is omitted, the script prompts interactively.

## 3) Runtime Flow

1. Launch/reuse Chrome with CDP (`open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=...`).
2. Connect via CDP.
3. Open Xiaohongshu home and check login state.
4. If login is required, pause and wait for manual login.
5. Open target profile URL.
6. Extract post cards from page state: `window.__INITIAL_STATE__.user.notes._value`.
7. Scroll page repeatedly to trigger pagination.
8. Keep collecting new posts until stagnant rounds hit threshold, or stop early after enough latest-only candidates are collected.
9. Build `/explore/<note_id>` links (with or without token).
10. Optionally open selected posts to enrich `publish_time`.
11. Write output file.

## 4) Technical Method

Execution stack:
- Browser startup: system command (`open -na "Google Chrome" ... --remote-debugging-port=<port>`)
- CDP communication: Playwright `connectOverCDP`
- Data extraction:
  - Primary path: `window.__INITIAL_STATE__.user.notes._value`
  - Parses `noteId`, `xsecToken`, sticky flag, and title from each post card object
- Pagination: repeated viewport scrolling with stagnant-round stopping
- Output: plain text file, either `url` or `publish_time<TAB>url` per line

## 5) Output Structure

If `--output_path` is a file:

```text
/abs/path/xhs-user-<user_id>-post-links.txt
```

If `--output_path` is a directory:

```text
<output_dir>/
  xhs-user-<user_id>-post-links.txt
```

Each line example:

```text
https://www.xiaohongshu.com/explore/<note_id>?xsec_token=...&xsec_source=pc_user
```

Or canonical mode (`--include_token false`):

```text
https://www.xiaohongshu.com/explore/<note_id>
```

Publish-time mode (`--include_publish_time true`) example:

```text
1773381736000	https://www.xiaohongshu.com/explore/<note_id>?xsec_token=...&xsec_source=pc_user
```

## 6) Limitations and Fragility

This skill is robust for current pages, but not fully inference-driven. Main risks:

1. Frontend state schema drift
- Extraction depends on `__INITIAL_STATE__.user.notes._value` shape.
- If Xiaohongshu changes schema, extraction may return partial/empty results.

2. Pagination behavior variability
- Scroll loading behavior can differ by account/device/session.
- Some posts may not appear if lazy loading is blocked or delayed.

3. Login gate and anti-bot changes
- Login detection is heuristic (URL/text).
- Anti-bot policy changes may cause empty or incomplete lists.

4. Token availability differences
- Some post cards may not expose `xsecToken` consistently.
- In token-included mode, certain links may still fall back to canonical URL.

## 7) Troubleshooting

- If output is empty:
  - Confirm current Chrome is logged in to Xiaohongshu.
  - Open the profile manually in the same browser profile and retry.
- If exported count is lower than expected:
  - Increase `--max_scroll_rounds`.
  - Re-run after refreshing profile page.
- If you only need latest posts:
  - Use `--exclude_sticky true --limit <N>`.
  - Add `--include_publish_time true` to make the selection easier to verify later.
- If output path behaves unexpectedly:
  - Pass absolute path explicitly and verify write permission.

## 8) Notes for Maintenance

When page structure changes, prioritize:
1. Fixing `__INITIAL_STATE__` extraction path
2. Adjusting pagination scroll strategy
3. Preserving output contract (one link per line, deduplicated)
