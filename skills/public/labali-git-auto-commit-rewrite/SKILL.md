---
name: labali-git-auto-commit-rewrite
description: Generate a clear, structured conventional commit message from current repository changes, commit all changes locally, and then run scripts/clean_commit.sh to normalize the final commit text. Use when users ask to commit the whole project with high-quality change descriptions.
license: MIT
compatibility: macOS / Linux; requires git in PATH; runs in AI agent environment with shell access.
metadata:
  pattern: pipeline
---

# labali-git-auto-commit-rewrite

Use this skill for one-shot local commit workflows with strong commit-message quality.

## Runtime Inputs

- Repository working tree state.
- User intent to commit all current changes.
- Optional commit focus if user specifies scope emphasis.

## Execution Contract

1. Verify current directory is a Git repository.
2. Inspect working tree changes (`git status --short`, `git diff --name-status`) before writing message.
3. If any changed files are under `skills/`, run `npm run skills:validate` and `npm run check:chinese` before staging.
   - If either check fails, fix the issues first and do not proceed to commit.
4. Generate a commit message that is both clear and elegant:
   - Subject format: `<type>(<scope>): <subject>` or `<type>: <subject>`
   - Subject is concise, action-oriented, and specific to the dominant change set.
   - Body contains 2-6 bullet points, each tied to real grouped changes from diff.
   - Avoid vague wording like only `update`/`align` when multiple meaningful changes exist.
5. Stage all changes with `git add -A`.
6. If there are no staged changes, stop and report `No changes to commit.`.
7. Commit once with the generated subject and body.
8. MUST run `<skill_base_dir>/scripts/clean_commit.sh` immediately after commit (non-optional).
   The skill base directory is provided in the `Base directory for this skill:` line at the top of the invocation header.
9. Return final commit hash and final subject line.

## Failure Handling

- If repository is not a Git repo, fail fast with explicit message.
- If there are no changes to commit, return `No changes to commit.`.
- Never fabricate commit/test outcomes; report command failures verbatim.

## Message Quality Rules

- Use English commit messages.
- Keep subject under 72 characters when possible.
- Use a real blank line between subject and body.
- Body bullets must reflect actual file-level intent, not generic placeholders.
- Prefer aggregate summaries when many files changed, then include concrete sub-actions in body.

## Commit Helper

Post-commit cleanup script lives at `scripts/clean_commit.sh` inside this skill's own directory.
Always resolve it via the `Base directory for this skill:` value injected at invocation time:

```bash
bash <skill_base_dir>/scripts/clean_commit.sh
```
