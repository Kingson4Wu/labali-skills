---
name: labali-xiaohongshu-export-user-post-links
description: Extract all Xiaohongshu post links from a user profile URL and write them to a specified local file using browser-only automation with manual-login session reuse. Use when tasks provide a profile link and need complete per-post explore URLs (with xsec token) exported to disk.
license: MIT
compatibility: macOS / Linux; requires Chrome with remote-debugging enabled (default port 9222) and an authenticated Xiaohongshu session; Node.js ≥ 18 + tsx; internet access required.
allowed-tools: "Bash(npx:*), Bash(pnpm:*)"
metadata:
  pattern: pipeline
---

# labali-xiaohongshu-export-user-post-links

Treat this skill as a layered system, not a single script.

## Layer Contract

1. `SKILL.md` (this file) is the policy layer.
   - Define goals, constraints, success criteria, and boundaries.
2. `references/architecture.md` is the strategy layer.
   - Define extraction model, pagination strategy, and fallback policy.
3. `scripts/*.ts` is the execution layer.
   - Implement browser startup, profile parsing, pagination scrolling, and output writing.

## Required Constraints

- Use browser automation only.
- Do not use Xiaohongshu private APIs.
- Reuse manual-login session via unified Chrome CDP startup:
  `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-labali"`.
- Parse links from profile page state with pagination scrolling.
- Export links to a specified local file path.

## NEVER

- Never write links to the output file without deduplication.
- Never stop scrolling based on a fixed count alone — continue until no new posts are discovered or an explicit end marker is present.
- Never report success based on action completion alone — verify the output file is written with at least one link.

## Success Criteria

A run is successful only when all conditions hold:

1. The profile is opened and parsed for post cards.
2. Scrolling pagination continues until no new posts are discovered.
3. Extracted links are deduplicated.
4. Output file is written as plain text lines, with optional publish-time prefix.

## Runtime Inputs

Use `skill.yaml` as the source of truth for input schema.

## Operational Mode

- Default mode: guided browser flow + profile-state extraction + scroll pagination.
- Startup guidance:
  - launch/reuse Chrome by unified CDP command,
  - open Xiaohongshu home page first,
  - if login is required, pause for manual login.
- Input guidance:
  - if `profile_url` is missing, prompt interactively,
  - if `output_path` is missing, prompt interactively with default.
- Export policy:
  - default output links include `xsec_token` and `xsec_source=pc_user`,
  - optional canonical-only mode can output `/explore/<note_id>` URLs,
  - optional latest-only mode can stop early after enough non-sticky candidates are found,
  - optional publish-time mode can prefix each exported line with `publish_time<TAB>`.

> If fallback or pagination decisions are unclear, load `references/architecture.md`.
> If link-parsing strategy is unclear, load `references/plan.md`.

## Resources

- Architecture and standards: `references/architecture.md`
- Workflow map and extraction plan: `references/plan.md`
- Shared runtime and parser helpers: `scripts/core.ts`
- Main orchestration: `scripts/executor.ts`
- CLI entry: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
