# Skill Authoring Guide

Reference this document when creating or modifying a skill.

## Skill Types

Skill types are **reference models**, not fixed labels. They help determine which layers a skill needs, but a skill is not required to declare its type. Skills evolve — a `cli` skill may grow into `hybrid` as requirements change. Use the closest type as a guide; introduce a new pattern when none fit.

| Type | Description |
|------|-------------|
| `browser` | Playwright + Chrome CDP; operates web UI semantically |
| `policy` | Pure Claude Code reasoning; no scripts needed |
| `cli` | Wraps command-line tools or scripts (Python, shell, TypeScript) |
| `hybrid` | AI reasoning combined with script assistance |

## Universal Requirements (all types)

- `SKILL.md` — policy layer; frontmatter must include `name` (matching folder name) and `description`
- `agents/openai.yaml` — skill interface manifest for discovery and invocation
- `README.md` — usage documentation

## Layer Requirements by Type

| Layer | Location | `browser` | `policy` | `cli` | `hybrid` |
|-------|----------|-----------|----------|-------|---------|
| Policy | `SKILL.md` | required | required | required | required |
| Strategy | `references/` | required | recommended | optional | recommended |
| Execution | `scripts/` | required | not needed | required | required |

## Optional Files (all types)

`skill.yaml` (input schema), `tests/`, `assets/`

## agents/openai.yaml

Every skill must have this file. It is the skill's public interface manifest:

```yaml
version: 1
interface:
  display_name: Human-readable skill name
  description: One-sentence description used for skill matching and discovery
  default_prompt: Default prompt template shown when the skill is invoked
```

## Dependency Management

- **TypeScript skills** (`browser`, `cli`, `hybrid` with `.ts` scripts): add `package.json` at the **skill root** (not inside `scripts/`). `scripts/run.ts` must use `ensureDeps()` with `__skillRoot = dirname(dirname(import.meta.url))` to auto-install on first run, before any third-party module is imported.
- **Python skills** (`cli`, `hybrid` with `.py` scripts): add `requirements.txt` at the **skill root** if any third-party packages are required.
- **Scripts using only built-ins**: no dependency file needed.

## Naming Rules

- Folder names: lowercase letters, numbers, hyphens only; max 64 characters.
- `name` in `SKILL.md` frontmatter must exactly match the folder name.
