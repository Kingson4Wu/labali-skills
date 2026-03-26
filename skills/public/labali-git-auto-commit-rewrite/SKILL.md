---
name: labali-git-auto-commit-rewrite
description: >-
  Generate a clear conventional commit message from current git changes, stage
  all files, commit locally, and run clean_commit.sh to normalize the result.
  Use when users want to commit, stage and commit, auto-commit, or generate a
  commit message for current changes. Trigger phrases: "commit changes", "git
  commit", "commit all", "commit message", "conventional commit".
license: MIT
allowed-tools: "Bash(git:*), Bash(npm:*), Bash(bash:*)"
metadata:
  pattern: pipeline
  compatibility: "macOS / Linux; requires git in PATH; runs in AI agent environment with shell access"
---

# labali-git-auto-commit-rewrite

## NEVER

- **Never fabricate diff content** or invent changes not present in `git diff` output — a fabricated commit message is worse than no message; it destroys trust in git history.
- **Never commit without running `npm run skills:validate` and `npm run check:chinese`** when any file under `skills/` has changed — these checks exist because broken skills and Chinese-in-docs violations have slipped through unguarded commits before.
- **Never amend a previous commit** — always create a new commit. Amending rewrites history and can silently overwrite commits that others (or hooks) have already acted on.
- **Never use `--no-verify`** to bypass pre-commit hooks — the hooks are the project's safety net; bypassing them defeats their purpose and masks real issues.
- **Never write a body that only lists filenames** — `- update core.ts` tells nothing; name the intent behind the change, not the file that changed.

## Commit Type Selection

| Type | When to use |
|------|-------------|
| `feat` | New capability or behavior visible to users/agents |
| `fix` | Corrects wrong behavior (not just wrong output) |
| `docs` | Documentation, examples, references only — no behavior change |
| `chore` | Housekeeping: structure, config, scripts, CI — no behavior change |
| `refactor` | Code restructure with no behavior change |
| `improve` | Meaningful enhancement to existing behavior (not a new feature, not a bug fix) |
| `perf` | Performance improvement |
| `test` | Test additions or changes only |

**Scope selection:** use a scope when the change is confined to one clear subsystem — `fix(browser): ...`, `feat(skill): ...`. Omit scope for cross-cutting changes that span multiple subsystems.

**When types conflict:** if a commit spans both a behavior change and a structural change, use the behavior-change type (`feat`/`fix`/`improve`) — structural changes are secondary to their purpose. If the two concerns are truly independent, split into two commits.

## Execution Contract

1. Inspect working tree changes (`git status --short`, `git diff --name-status`) before writing message.
2. If any changed files are under `skills/`, run `npm run skills:validate` and `npm run check:chinese` before staging.
   - If `skills:validate` fails: read the error, fix the SKILL.md or referenced file it names, re-run until green.
   - If `check:chinese` fails: find and remove Chinese characters from the flagged doc/config files, re-run until green.
3. Before writing the subject, determine: is this a behavior change (`feat`/`fix`/`improve`) or a structural change (`docs`/`chore`/`refactor`)? This choice drives the type.
   Generate a commit message that is both clear and elegant:
   - Subject format: `<type>(<scope>): <subject>` or `<type>: <subject>`
   - Subject is concise, action-oriented, and specific to the dominant change set.
   - Body contains 2-6 bullet points, each tied to real grouped changes from diff.
   - Avoid vague wording like only `update`/`align` when multiple meaningful changes exist.
   - **MANDATORY — load `examples/good.md` before writing the message** to calibrate quality. Load `examples/anti-pattern.md` if the draft message feels vague or generic.
4. Stage all changes with `git add -A`.
5. Commit once with the generated subject and body. The commit command MUST be prefixed with `LABALI_SKILL_COMMIT=1` so the repository's pre-commit hook recognizes it as skill-authorized:
   ```bash
   LABALI_SKILL_COMMIT=1 git commit -m "..."
   ```
6. MUST run `<skill_base_dir>/scripts/clean_commit.sh` immediately after commit (non-optional).
   The skill base directory is provided in the `Base directory for this skill:` line at the top of the invocation header.
   `clean_commit.sh` may rewrite the subject — read the final hash and subject from its output, not from the original commit.

## Message Quality Rules

- Body bullets must reflect actual file-level intent, not generic placeholders.
- Prefer aggregate summaries when many files changed, then include concrete sub-actions in body.

## Failure Handling

- If repository is not a Git repo, fail fast with explicit message.
- If there are no changes to commit, return `No changes to commit.`.

## Resources

| When | Must load | Do NOT load |
|------|-----------|-------------|
| Always — before writing the message | `examples/good.md` | `examples/anti-pattern.md` |
| Draft feels vague, generic, or uncertain | `examples/anti-pattern.md` | — |
