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
   `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-labali"`.
2. Connect through CDP.
3. Open Xiaohongshu home page and check login state.
4. Open target profile URL.
5. Repeatedly extract post cards from `__INITIAL_STATE__.user.notes._value`.
6. Scroll and wait until no new post IDs are found across consecutive rounds.
7. Build explore links from `noteId + xsecToken`.
8. Deduplicate and write output file.

## 3) Extraction Standards

- First priority: parse `window.__INITIAL_STATE__` user notes.
- Accept note objects from either top-level fields or nested `noteCard` fields.
- Support tokenized URL output and canonical URL output.
- Keep deterministic output ordering by first-seen order.

## 4) Output Correctness Standards

- One URL per line.
- No blank lines.
- Deduplicate by final URL.
- Report total links and output file path.

## 5) Logging and Diagnostics

- Log stages: startup, login-check, profile-open, extract-loop, write-output.
- Log discovered count growth per scroll round.
- Return actionable errors on extraction or write failure.
