# Workflow Plan

## Stage Decision Table

When a failure or ambiguous situation is encountered, use this table to decide the next action:

| Situation | Action |
|-----------|--------|
| CDP not responding on port 9222 | Launch Chrome with exact startup command; wait 3s; retry once |
| Login wall detected before post open | Prompt user to log in; do not proceed until confirmed |
| Login wall detected after post open | Pause extraction; prompt user; retry in the same session |
| Image count 0 after extraction | Check if xsec_token was preserved in navigation URL; reload with full URL |
| Image count still 0 after reload with full URL | Session likely expired — prompt user to re-authenticate in the browser window, then retry extraction in the same session |
| publish_time not found | Use note_id alone for folder name: `unknown-<note_id>` |
| Existing XHS tab found | Reuse it — navigate it to the post URL; do not open a new tab |
| No XHS tab found | Open a new tab; navigate to the post URL |
| Folder already exists at output path | Append `-2`, `-3`, etc. rather than overwriting |
| Video merge fails (ffmpeg not found) | Report error with install command (`brew install ffmpeg`); keep segment files intact for manual merge |

## Extraction Heuristics

- **Image URL recognition**: XHS image CDNs use domains matching `sns-img-*.xhscdn.com`; filter avatars by path patterns (`/avatar/`, `/profile/`); exclude URLs shorter than 40 characters (typically icons).
- **Publish time extraction**: prefer `og:article:published_time` meta tag; fallback to DOM `.date` selector; fallback to current timestamp with `unknown-` prefix in folder name.
- **Video detection**: check network intercept for `.m3u8` or `.mp4` URLs before inspecting DOM; if intercept yields nothing, check DOM for `<video src>` attributes.

## Comment Export Caveats

- XHS renders comments dynamically; scroll depth directly affects how many comments are captured — shallow scroll = low coverage.
- Reply threading is unreliable — nested replies may appear as top-level comments in the extracted data.
- Even a successful run may miss 20–40% of comments on high-engagement posts; this is a platform-side limitation, not a bug.
- Comment images are fetched separately after text extraction; a partial failure here should not block the main post download.

## Output Naming Edge Cases

- Post without publish_time: folder = `unknown-<note_id>`
- Folder already exists: append `-2`, `-3`, etc. rather than overwriting
- note_id must always be included in the folder name regardless of whether publish_time is present
