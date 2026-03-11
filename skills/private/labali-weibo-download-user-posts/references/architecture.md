# Architecture

## Layered Boundaries

- Policy layer: `SKILL.md` defines stable constraints and outcomes.
- Strategy layer: this document and `plan.md` define extraction/recovery approach.
- Execution layer: `scripts/*.ts` implements current browser/CDP flow.

## Execution Model

1. Reuse or launch Chrome with CDP.
2. Connect using Playwright `connectOverCDP`.
3. Navigate to user URL and verify login.
4. Fetch timeline pages with authenticated web endpoints over the same browser session.
5. Fallback to scroll + DOM extraction only when endpoint extraction is unavailable.
6. Download media through authenticated browser request context.
7. Write structured outputs (`posts.json`, `user.md`, per-post `post.md`).

## Download Correctness Standards

- Prefer deterministic file naming.
- Deduplicate extracted URLs before downloading.
- Preserve partial success and return failure list.
- Avoid aborting entire run because of one failed media URL.

## Failure Handling

- If login required: wait for manual login and retry navigation.
- If page shape changes: fallback to broader selector patterns.
- If media response mismatches expected type: record failure and continue.
