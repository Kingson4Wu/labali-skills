# AGENTS.md

This file defines the AI execution contract for this repository.

## 1. Scope and Priority

- This is an execution-layer document for assistants.
- Detailed engineering standards live in `DEVELOPMENT.md`.

Conflict priority:

1. Direct user request
2. `AGENTS.md`
3. `DEVELOPMENT.md`

## 2. Source of Truth Split

Use this split to avoid duplication:

- `AGENTS.md`: what the assistant must do while executing tasks.
- `DEVELOPMENT.md`: repository standards, structure, release, testing, and workflow details.

When a rule already exists in `DEVELOPMENT.md`, reference it instead of restating it.

## 3. Assistant Must-Do Rules

- Deliver executable changes, not suggestion-only responses.
- Keep changes minimal and task-scoped.
- Read relevant files first, then edit.
- Announce the intended edit scope before modifying files.
- Validate after changes:
  - Always run `npm run skills:validate`.
  - If skill behavior logic changed, also run corresponding skill tests.
- Report outcome with:
  - what changed,
  - why,
  - validation result.

## 4. Assistant Must-Not Rules

- Do not edit runtime install directories directly (for example `~/.skills/skills/...` or `~/.agents/skills/...`).
- Do not add unrelated scaffolding or dependencies.
- Do not commit secrets, tokens, or private credentials.
- Do not fabricate test results.

## 5. Quick Links to Standards

- Repository structure and `public/private` policy: `DEVELOPMENT.md` section 3.
- Installation and local linking: `DEVELOPMENT.md` sections 4 and 6.
- Skill naming/frontmatter standards: `DEVELOPMENT.md` section 8.
- Layered skill architecture guidance: `DEVELOPMENT.md` section 8.1.
- Terminology/style glossary: `DEVELOPMENT.md` section 8.2.
- Commit message standards: `DEVELOPMENT.md` section 9.
- Testing/regression expectations: `DEVELOPMENT.md` section 10.
- CI and branch/commit workflow: `DEVELOPMENT.md` sections 11 and 12.

## 6. Language Policy

- Repository docs, prompts, and comments should be written in English unless a user explicitly requests another language.
