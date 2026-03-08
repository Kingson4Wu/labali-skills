---
name: labali-git-auto-commit-rewrite
description: Automatically stage all git changes, generate and normalize a conventional commit message from current staged diff context, then commit locally without confirmation. Use when user asks to batch commit repository changes quickly with standardized commit wording.
---

# labali-git-auto-commit-rewrite

Use this skill for one-shot local commit workflows.

## Quick Use

```bash
skills/public/labali-git-auto-commit-rewrite/scripts/auto_commit_rewrite.sh
```

Optional override:

```bash
COMMIT_MSG="feat(api): add user profile endpoint" \
skills/public/labali-git-auto-commit-rewrite/scripts/auto_commit_rewrite.sh
```

Regression tests:

```bash
skills/public/labali-git-auto-commit-rewrite/tests/test_regression.sh
```

## Workflow

1. Verify current directory is a Git repository.
2. Stage all changes with `git add -A`.
3. If no staged changes exist, print `No changes to commit.` and stop.
4. Inspect staged diff and summarize intent as a conventional commit message.
5. Normalize commit subject format before commit.
6. Commit locally without extra confirmation using generated message.
7. Always run bundled `scripts/clean_commit.sh` to rewrite and clean the latest commit message.
8. Return final commit hash and subject line.

## Commit Message Rules

- Follow `references/git_standards.md` as the primary commit spec.
- Prefer conventional format: `<type>(<scope>): <subject>`.
- Keep subject concise (under 72 chars) and action-oriented.

## Bundled Resources

- Deterministic helper script: `scripts/auto_commit_rewrite.sh`
- Post-commit rewrite script: `scripts/clean_commit.sh`
- Commit specification: `references/git_standards.md`
- Design notes: `references/source-command.md`
