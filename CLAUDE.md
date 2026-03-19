# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run skill:init          # Scaffold a new skill interactively
npm run skill:validate      # Validate a single skill's structure and metadata
npm run skills:validate     # Validate all skills (required before every PR)
npm run check:chinese       # Check for Chinese characters in doc/config files
```

These scripts delegate to `scripts/init_skill.py`, `scripts/quick_validate.py`, `scripts/validate_all.py`, and `scripts/check_chinese.py`.

## Repository Architecture

This is a **skills monorepo** — a collection of reusable AI agent skills for Claude Code execution. Skills are organized under `skills/public/` (shareable) and `skills/private/` (internal-only).

## Skill Types

Every skill has a type. When creating a new skill, determine the type from the task requirements. New types may be introduced when none of the existing types fit.

| Type | Code | Description |
|------|------|-------------|
| Browser automation | `browser` | Playwright + Chrome CDP; operates web UI semantically |
| AI policy | `policy` | Pure Claude Code reasoning; no scripts needed |
| CLI tool | `cli` | Wraps command-line tools or scripts (Python, shell) |
| Hybrid | `hybrid` | AI reasoning combined with script assistance |

## Skill Structure

Each skill lives in its own directory. Required files depend on the skill type.

### Universal requirements (all types)

- `SKILL.md` — policy layer; frontmatter must include `name` (matching folder name) and `description`
- `agents/openai.yaml` — skill interface manifest used for discovery and invocation by agent runtimes
- `README.md` — usage documentation

### Layer requirements by type

| Layer | Location | `browser` | `policy` | `cli` | `hybrid` |
|-------|----------|-----------|----------|-------|---------|
| Policy | `SKILL.md` | required | required | required | required |
| Strategy | `references/` | required | recommended | optional | recommended |
| Execution | `scripts/` | required | not needed | required | required |

### Dependency management

- **TypeScript skills** (`browser`, `cli`, `hybrid` with `.ts` scripts): add `package.json` at the **skill root** (not inside `scripts/`). `scripts/run.ts` must call `ensureDeps()` using `__skillRoot = dirname(dirname(import.meta.url))` before importing any third-party modules.
- **Python skills** (`cli`, `hybrid` with `.py` scripts): add `requirements.txt` at the **skill root** if any third-party packages are needed.
- **Pure built-in scripts**: no dependency file needed.

### Optional files (all types)

`skill.yaml` (input schema), `tests/`, `assets/`

## Execution Model

### Browser automation (`browser` type)

Entry point is `scripts/auto-executor.ts`, which:
1. Tries **deterministic trajectory** (`deterministic.ts`) first — fast replay of known UI paths
2. Falls back to **policy executor** (`executor.ts`) — semantic re-discovery when UI has changed
3. Verifies success by **business state** (e.g., episode appears in Published list), not by click completion

### AI policy (`policy` type)

Claude Code reads `SKILL.md` and `references/` directly and reasons through the task. No script invocation.

### CLI tool (`cli` type)

Claude Code invokes `scripts/run.ts` or the Python script directly with the appropriate arguments.

### Hybrid (`hybrid` type)

Claude Code reasons using `SKILL.md` and `references/`, then delegates deterministic steps to scripts.

## Policy Layer Boundaries

`SKILL.md` must use semantic language only — no UI strings, CSS selectors, or XPath.

- Correct: "readiness indicator", "media upload confirmation state"
- Wrong: `"Preview ready!"`, `.publish-button`, `#episode-form`

Strategy (`references/`) may include observed UI patterns and concrete hints, but must mark them as observations, not requirements.

## agents/openai.yaml

Every skill must have `agents/openai.yaml`. It is the skill's public interface manifest:

```yaml
version: 1
interface:
  display_name: Human-readable skill name
  description: One-sentence description used for skill matching and discovery
  default_prompt: Default prompt template shown when the skill is invoked
```

## Language Policy

**All files must be in English** — docs, prompts, code, config, tests, and commit messages.

**Only exception:** `README.zh-CN.md` files are permitted for Chinese translations.

Run `npm run check:chinese` to verify. This check also runs in CI.

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
