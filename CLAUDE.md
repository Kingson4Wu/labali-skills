# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run skill:init          # Scaffold a new skill interactively
npm run skill:validate      # Validate a single skill's structure and metadata
npm run skills:validate     # Validate all skills (required before every PR)
```

These scripts delegate to `scripts/init_skill.py`, `scripts/quick_validate.py`, and `scripts/validate_all.py`.

## Repository Architecture

This is a **skills monorepo** — a collection of reusable AI agent skills. Skills are organized under `skills/public/` (shareable) and `skills/private/` (internal-only).

### Skill Structure

Each skill lives in its own directory and follows a three-layer architecture:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Policy** | `SKILL.md` | Semantic contract: goals, constraints, success criteria. Stable. |
| **Strategy** | `references/` | Workflow variants, UI pattern hints, recovery rules. Updates as UI drifts. |
| **Execution** | `scripts/` | Concrete implementation (TypeScript or shell). Treated as replaceable. |

**Required files per skill:**
- `SKILL.md` — frontmatter must include `name` (matching folder name) and `description`
- `agents/openai.yaml` — agent interface config (recommended)

**Optional files:** `skill.yaml` (input schema), `scripts/`, `references/`, `tests/`, `assets/`

### Execution Model (Complex Skills)

Complex browser-automation skills use a unified entry point (`scripts/auto-executor.ts`) that:
1. Tries **deterministic trajectory** (`deterministic.ts`) first — fast replay of known UI paths
2. Falls back to **policy executor** (`executor.ts`) — semantic re-discovery when UI has changed
3. Verifies success by **business-state** (e.g., episode is in Published list), not by click completion

### Policy Layer Boundaries

`SKILL.md` must use semantic language only — no UI strings, CSS selectors, or XPath.

- Correct: "readiness indicator", "media upload confirmation state"
- Wrong: `"Preview ready!"`, `.publish-button`, `#episode-form`

Strategy (`references/architecture.md`, `references/plan.md`) may include observed UI patterns marked as hints, not requirements.

## Language Policy

**All files must be in English** — docs, prompts, code, config, tests, and commit messages.

**Only exception:** `README.zh-CN.md` files are permitted for Chinese translations.

## Commit Message Format

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Describe intent clearly; avoid vague `update` commits.

## Key Constraints

- Do not edit runtime directories (`~/.skills/skills/`, `~/.agents/skills/`)
- Skill `name` in frontmatter must exactly match the folder name
- Skill folder names: lowercase, numbers, hyphens only, max 64 characters
- Run `npm run skills:validate` and relevant tests before merging any change
