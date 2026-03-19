# AGENTS.md

AI execution contract for this repository. Engineering standards live in `DEVELOPMENT.md` and `docs/`.

Conflict priority: user request > `AGENTS.md` > `DEVELOPMENT.md` / `docs/`

## Repo-Specific Rules

- Always run `npm run skills:validate` and `npm run check:chinese` after any skill change.
- All git commits must be made using the `labali-git-auto-commit-rewrite` skill.
- Do not edit runtime install directories (`~/.skills/skills/`, `~/.agents/skills/`, `~/.claude/skills/`).

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
