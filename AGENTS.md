# AGENTS.md

AI execution contract for this repository. Engineering standards live in `DEVELOPMENT.md` and `docs/`.

Conflict priority: user request > `AGENTS.md` > `DEVELOPMENT.md` / `docs/`

## Repo-Specific Rules

> **CRITICAL: Never commit code automatically.** Only commit when the user explicitly requests it — e.g., says "commit", or invokes `/labali-git-auto-commit-rewrite`. Finishing a task does NOT imply permission to commit. If in doubt, do not commit — ask instead.
- Always run `npm run skills:validate` and `npm run check:chinese` after any skill change, and fix all failures before committing.
- All git commits MUST be made using the `labali-git-auto-commit-rewrite` skill. Direct `git commit` calls are blocked by the Claude Code hook.
  - If the skill is installed, invoke it via the `Skill` tool.
  - If the skill is not installed or not found, read `skills/public/labali-git-auto-commit-rewrite/SKILL.md` and follow it manually as a fallback.
  - The skill's commit step requires `LABALI_SKILL_COMMIT=1 git commit ...` — this is the authorization signal checked by the hook.
- Do not edit runtime install directories (`~/.skills/skills/`, `~/.agents/skills/`, `~/.claude/skills/`).

## Convention Capture

When a reusable project convention is established during a task — through a bug fix, a user correction, or a recurring pattern — update the appropriate doc file in the same task without being asked.

**What counts as a convention worth capturing:**
- A bug fix that reveals a non-obvious rule (e.g., "preserve auth tokens in URLs")
- A user correction of Claude's behavior (e.g., "don't do X")
- A design decision that applies beyond the current task

**What does NOT need to be captured:**
- One-off task instructions ("use this specific file path")
- Preferences the user may change ("make it shorter this time")
- Anything already documented

**Routing table — where to write it:**

| Convention type | Target file |
|----------------|-------------|
| AI model behavior constraints (commit, brevity, detail level) | `CLAUDE.md` or `AGENTS.md` |
| Skill-specific bug patterns or operational rules | Skill's `SKILL.md` + `references/plan.md` |
| Cross-skill patterns (browser automation, etc.) | `docs/browser-automation.md` or relevant `docs/` file |
| Naming, language, format rules | `docs/conventions.md` |
| Dependency setup, dev workflow | `docs/skill-authoring.md` or `docs/workflow.md` |
| Architecture terminology | `docs/reference.md` |

## Quick Links

| Task | Load |
|------|------|
| Creating or modifying a skill | `docs/skill-authoring.md` |
| Working on a browser automation skill | `docs/browser-automation.md` |
| Committing code, language/naming rules | `docs/conventions.md` |
| Setting up environment or dev workflow | `docs/workflow.md` |
| Writing or running tests | `docs/testing.md` |
| Looking up concepts or terminology | `docs/reference.md` |
| Overall repo structure and principles | `DEVELOPMENT.md` |
