# Repository Conventions

Reference this document for language policy, commit format, and naming rules.

## Language Policy

All files must be in English — docs, prompts, code, config, tests, and commit messages.

**Only exception:** `README.zh-CN.md` files are permitted for Chinese translations.

Run `npm run check:chinese` to verify. This check also runs in CI.

## Commit Workflow

All commits must be made using the `labali-git-auto-commit-rewrite` skill. Do not commit directly without going through the skill.

## Commit Message Format

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

- Subject should describe intent clearly; avoid vague `update` commits.
- For mixed changes, prioritize the primary change in the subject.
- Use `test:` only for pure test changes.

## Naming Rules

- Skill folder names: lowercase letters, numbers, hyphens only; max 64 characters.
- `name` in `SKILL.md` frontmatter must exactly match the folder name.

## Pre-commit Checklist

- `npm run skills:validate` passed
- `npm run check:chinese` passed
- `SKILL.md` frontmatter is valid
- Naming and directory rules satisfied
- Tests added or updated for logic changes
- Documentation matches actual behavior
