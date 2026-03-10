# labali-git-auto-commit-rewrite Usage

How to use the `labali-git-auto-commit-rewrite` skill in chat to generate a clear conventional commit message and commit all current changes.

Note: `scripts/clean_commit.sh` is mandatory inside the skill and runs automatically after every commit.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
```

Update to the latest version (run the install command again)

## 2) Describe the task in natural language (without naming the skill)

Use this mode when you want to describe the goal directly and let the agent select the skill.

Recommended information:

- Commit scope (usually all current changes in this repository)
- Commit intent summary
- Optional preferred commit style (`type(scope): subject`)
- Optional wording constraints (for example concise, under 72 chars in subject)

### Full Prompt Example (Natural Language)

```text
Please commit all current changes in this repository.
Generate a clear and elegant conventional commit message based on the actual diff.
Use a concise subject and include meaningful bullet points in the body.
Return the final commit hash and final subject.
```

## 3) Explicitly specify the skill

Use this mode when you want to force execution with this specific skill.

Recommended style: include the skill name explicitly in the prompt (for example `$labali-git-auto-commit-rewrite` or `labali-git-auto-commit-rewrite`).

Information guidance:

- Confirm to commit all current changes
- Provide optional message preference
- Ask the agent to return final hash and subject

### Full Prompt Example (Explicit Skill)

```text
Please use $labali-git-auto-commit-rewrite for this task.
Commit all current repository changes with a high-quality conventional commit message.
Subject should be specific and action-oriented; body should contain 2-6 bullet points mapped to grouped changes.
Avoid vague-only wording like just "update" or "align" when multiple meaningful changes exist.
After commit, report:
1) final commit hash
2) final commit subject
```

## 4) Minimal Template (Copy/Paste)

```text
Please commit all current changes in this repository.
Commit intent:
Preferred type/scope (optional):
Preferred wording constraints (optional):
Return final hash and subject.
```
