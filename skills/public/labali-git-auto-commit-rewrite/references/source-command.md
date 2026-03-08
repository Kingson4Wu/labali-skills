# Design Notes

This skill is intentionally self-contained and portable.

Core behavior:

1. Stage all repository changes.
2. Generate a conventional commit subject (or use `COMMIT_MSG` override).
3. Commit without interactive confirmation.
4. Always run bundled `scripts/clean_commit.sh`.
5. Exit early with `No changes to commit.` when nothing is staged.
