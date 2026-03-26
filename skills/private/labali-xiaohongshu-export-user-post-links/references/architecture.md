# Architecture and Standards

## 1) Layered Boundaries

### Policy Layer (`SKILL.md`)
- Scope: intent, constraints, success criteria, boundaries.
- Keep stable across implementation rewrites.

### Strategy Layer (`references/*.md`)
- Scope: extraction path selection, scroll pagination, dedupe/output policy.
- Prefer state-first extraction, use DOM only as fallback.

### Execution Layer (`scripts/*.ts`)
- Scope: Chrome CDP startup/reuse, profile navigation, extraction loop, and file export.
- Current decomposition:
  - `core.ts`: URL parsing, state extraction, scrolling, output writing.
  - `executor.ts`: orchestration and login recovery.
  - `run.ts`: CLI argument parsing.

## 2) Execution Model

1. Launch/reuse Chrome:
   `open -na "Google Chrome" --args --remote-debugging-port=9223 --user-data-dir="$HOME/.chrome-labali-no-proxy" --no-proxy-server`.
2. Connect through CDP.
3. Open Xiaohongshu home page and check login state.
4. Open target profile URL.
5. Repeatedly extract post cards from `__INITIAL_STATE__.user.notes._value`.
6. Scroll and wait until no new post IDs are found across consecutive rounds, or stop early when latest-only candidate count is satisfied.
7. Build explore links from `noteId + xsecToken`, preserving sticky metadata and profile order.
8. Optionally open selected post detail pages to enrich `publish_time`.
9. Write output file.

## 3) Extraction Standards

- First priority: parse `window.__INITIAL_STATE__` user notes.
- Accept note objects from either top-level fields or nested `noteCard` fields.
- Preserve sticky flag and profile-order index from card state.
- Support tokenized URL output and canonical URL output.
- Keep deterministic output ordering by first-seen order unless latest-only mode re-sorts selected candidates by publish time.

## 4) Output Correctness Standards

- One URL per line by default.
- When publish-time mode is enabled, write `publish_time<TAB>url` per line.
- No blank lines.
- Deduplicate by final URL.
- Report total links and output file path.

## 5) Logging and Diagnostics

- Log stages: startup, login-check, profile-open, extract-loop, write-output.
- Log discovered count growth per scroll round.
- Return actionable errors on extraction or write failure.
