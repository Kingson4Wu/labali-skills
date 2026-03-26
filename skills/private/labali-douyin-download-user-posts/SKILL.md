---
name: labali-douyin-download-user-posts
description: Download all posts from a specific Douyin user profile by using agent-browser automation over Chrome CDP with manual-login session reuse. Use when tasks require opening/reusing a Douyin user page, extracting post text/media links, downloading images/videos locally, and exporting per-post files.
license: MIT
compatibility: macOS / Linux; requires Chrome with remote-debugging enabled (default port 9223), profile `~/.chrome-labali-no-proxy`, and an authenticated Douyin session; Node.js ≥ 18 + tsx; internet access required.
allowed-tools: "Bash(npx:*), Bash(pnpm:*)"
metadata:
  pattern: pipeline
---

# labali-douyin-download-user-posts

Treat this skill as a layered system, not a single script.

## Layer Contract

1. `SKILL.md` (this file) is the policy layer.
   - Define goals, constraints, success criteria, and decision boundaries.
   - Stay semantic and stable across UI changes.
2. `references/architecture.md` is the strategy layer.
   - Define execution model, failure handling, and quality standards.
3. `scripts/*.ts` is the execution layer.
   - Scripts are execution assets, not the skill definition itself.
   - Use agent-browser style browser automation with Chrome CDP session reuse.
   - Keep extraction and downloading logic modular and replaceable.

## Required Constraints

- Use browser automation only.
- Do not call private/undocumented Douyin APIs directly.
- Reuse manual-login session via unified Chrome CDP startup:
  `open -na "Google Chrome" --args --remote-debugging-port=9223 --user-data-dir="$HOME/.chrome-labali-no-proxy" --no-proxy-server`.
- Prefer semantic extraction from visible page state and loaded resources.
- Download target user's timeline posts and assets (text, images, optional videos).
- Export per-post `post.md` and media files.
- Keep partial success: keep downloaded files even if some URLs fail.
- When `fixed_user_dir` is provided, reuse that exact folder and do not create a new timestamp folder.
- Reuse current opened user homepage tab when it already matches target user.
- For timeline batch runs, open each post detail in a temporary tab, extract/download, then close tab and return to homepage tab.
- For each post, keep only one final video file in `videos/` (prefer muxed AV or largest valid AV file).

## NEVER

- Never keep multiple video files per post — select one final file (muxed AV or largest valid AV) and remove the rest.
- Never download unrelated images for a video post.
- Never report success without verifying at least one post was extracted.

## Success Criteria

A run is successful only when all conditions hold:

1. A user output folder exists (new timestamp folder or provided `fixed_user_dir`).
2. At least one post is extracted from user timeline or direct video URL mode.
3. Per-post folders contain `post.md` and downloaded media when available.
4. Video posts do not download unrelated images.
5. URL output and logs retain canonical Douyin URL form.

## Runtime Inputs

Use `skill.yaml` as the source of truth for input schema.

## Operational Mode

- Default mode: guided browser flow + semantic extraction + authenticated media download.
- Links-only mode (`collect_links_only=true`): only collect full detail links from works timeline and export to `post_links.json` + `post_links.txt` under user output dir, no media download.
- Startup guidance:
  - launch/reuse Chrome by the unified `open -na "Google Chrome"` CDP command,
  - connect via CDP port,
  - open target user page,
  - check login status,
  - if required, guide user to complete manual login in the same window.
- Input guidance:
  - if `user_url` is missing, prompt interactively,
  - if `output_dir` is missing, prompt interactively with default.
- Pagination guidance:
  - scroll user timeline continuously,
  - click visible expansion controls where needed,
  - stop when no more new cards appear or explicit end markers appear.
- Text guidance:
  - prefer detail JSON `desc` from target `postId`,
  - strip platform-generated suffixes (e.g. Douyin share/promotion footers appended after the original post text).
- Publish time guidance:
  - extract from detail JSON `create_time` first,
  - fallback to visible page text parsing.

> If failure handling or extraction decisions are unclear, load `references/architecture.md`.
> If extraction or media selection strategy is unclear, load `references/plan.md`.

## Resources

- Architecture and standards: `references/architecture.md`
- Workflow map and extraction plan: `references/plan.md`
- Shared runtime and downloader helpers: `scripts/core.ts`
- Main orchestration: `scripts/executor.ts`
- CLI entry: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
