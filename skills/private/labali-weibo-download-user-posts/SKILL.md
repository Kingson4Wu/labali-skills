---
name: labali-weibo-download-user-posts
description: Download all posts from a specific Weibo user profile by using agent browser automation over Chrome CDP with manual-login session reuse. Use when tasks require opening a Weibo user page, loading more timeline items by scrolling, extracting post text and media links, downloading images/videos to local folders, and exporting structured metadata files.
license: MIT
compatibility: macOS / Linux; requires Chrome with remote-debugging enabled (default port 9222) and an authenticated Weibo session; Node.js ≥ 18 + tsx; internet access required.
allowed-tools: "Bash(npx:*), Bash(pnpm:*)"
metadata:
  pattern: pipeline
---

# labali-weibo-download-user-posts

Treat this skill as a layered system, not a single script.

## Layer Contract

1. `SKILL.md` (this file) is the policy layer.
   - Define goals, constraints, success criteria, and decision boundaries.
   - Stay semantic and stable across UI changes.
2. `references/architecture.md` is the strategy layer.
   - Define execution model, failure handling, and quality standards.
3. `scripts/*.ts` is the execution layer.
   - Scripts are execution assets, not the skill definition itself.
   - Use persistent browser profile for manual-login reuse.
   - Keep extraction and downloading logic modular and replaceable.

## Required Constraints

- Use browser automation only.
- Do not use private/undocumented Weibo APIs.
- Reuse manual-login session via unified Chrome CDP startup:
  `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-labali"`.
- Prefer semantic extraction from visible page state and loaded resources.
- Download target user's timeline posts and assets (text, images, optional videos).
- Export metadata files: `posts.json`, `user.md`, and per-post `post.md`.
- Keep partial success: keep downloaded files even if some URLs fail.

## NEVER

- Never delete or discard partially downloaded files on URL failure — keep all successfully downloaded content.
- Never report success unless at least one post was extracted and the output folder was created with `posts.json` and `user.md`.
- Never report success based on action completion alone — verify the output folder and metadata files exist.

## Success Criteria

A run is successful only when all conditions hold:

1. A user output folder is created under target local directory.
2. Folder naming format is `<timestamp>-<user_slug>`.
3. `posts.json` and `user.md` are generated.
4. At least one post is extracted from timeline.
5. Per-post folders contain `post.md` and downloaded media when available.
6. URL output and logs retain canonical user URL form.

## Runtime Inputs

Use `skill.yaml` as the source of truth for input schema.

## Operational Mode

- Default mode: guided browser flow + semantic extraction + authenticated media download.
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
  - scroll timeline,
  - click visible expansion controls,
  - stop when no more content appears or explicit end markers are present.

> If failure handling or extraction decisions are unclear, load `references/architecture.md`.
> If extraction strategy for a specific content type is unclear, load `references/plan.md`.

## Resources

- Architecture and standards: `references/architecture.md`
- Workflow map and extraction plan: `references/plan.md`
- Shared runtime and downloader helpers: `scripts/core.ts`
- Main orchestration: `scripts/executor.ts`
- CLI entry: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
