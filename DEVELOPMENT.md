# Skill Monorepo Development Guide

This document defines the directory strategy, development flow, engineering standards, and quality gates for skills in this repository.

`DEVELOPMENT.md` is the source of truth for repository standards. `AGENTS.md` only defines assistant execution behavior and references this document.

## 1. Goals and Scope

- Goal: manage prompts/skills as maintainable software assets.
- Scope: applies to all skills under `skills/public` and `skills/private`.

## 2. Core Architecture Layers

- Agent layer: task orchestration and skill selection.
- Skill layer: capability package (`SKILL.md`, `agents/openai.yaml`, resources, tests).
- Prompt layer: behavior strategy and output constraints (modular and versioned).
- MCP/Tool layer: external capabilities (files, search, database, APIs).

Responsibility boundary: Agent decides, Skill executes, Prompt constrains, Tools provide capabilities.

## 3. Repository Structure and Directory Strategy

```text
.
├── skills/
│   ├── public/
│   └── private/
├── scripts/
│   ├── init_skill.py
│   ├── quick_validate.py
│   └── validate_all.py
├── .github/workflows/
└── DEVELOPMENT.md
```

Directory usage rules:

- `skills/public`: reusable and shareable skills.
- `skills/private`: internal-only skills (internal workflow, sensitive context, non-public constraints).
- Keep the dual-directory structure permanently, even if one side is temporarily empty.

Each skill directory should include at least:

- `SKILL.md` (required, frontmatter: `name`, `description`)
- `agents/openai.yaml` (recommended)

Optional directories:

- `scripts/`
- `references/`
- `assets/`
- `tests/`
- `eval/`

## 4. Installation and Usage

### 4.1 Runtime Installation (npx)

```bash
npx skills add github.com/<owner>/<repo> --skill <skill-name>
```

Repository example:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
```

Default runtime directory is usually:

```text
~/.skills/skills/<skill-name>
```

If `SKILLS_HOME` is set, use:

```text
$SKILLS_HOME/skills/<skill-name>
```

Note: `npx skills add` installs a runtime copy. Do not use that directory as your development workspace.

Current local agent runtime path for this repo:

```text
~/.agents/skills/
```

### 4.2 Local Repository Commands

```bash
# Initialize a skill
npm run skill:init -- <name> --path skills/public --resources scripts,references,assets

# Validate one skill
npm run skill:validate -- skills/public/<name>

# Validate all skills
npm run skills:validate
```

## 5. Standard Development Flow

1. Create or update skills in this development repository (not in runtime copies).
2. Run functional checks locally (run skill scripts where needed).
3. Run structure and metadata validation: `npm run skills:validate`.
4. If skill behavior logic changes, run corresponding tests (example: `tests/test_regression.sh`).
5. Commit and open a PR.

## 6. Local Debugging with Symlinks

Keep development and runtime directories separated. Use symlinks for local debugging:

```bash
# Install all public skills
ln -s ~/programming/kingson4wu/labali-skills/skills/public/* ~/.agents/skills/

# Install a single skill
ln -s ~/programming/kingson4wu/labali-skills/skills/public/labali-git-auto-commit-rewrite ~/.agents/skills/
```

Advantages:

- Changes take effect immediately.
- Full git history stays in one place.
- No repeated reinstall required.

## 7. Prompt Engineering Standards

- Avoid oversized monolithic prompt files; use modular decomposition.
- Extract shared rules into reusable fragments.
- Prompt changes must be traceable (version, change note, evaluation result).

Suggested layout:

```text
skills/<name>/prompts/
  system.md
  includes/
    style-guide.md
    domain-rules.md
```

## 8. Skill Standards (Mandatory)

- Naming: lowercase letters, numbers, hyphens; max length 64.
- Frontmatter: only `name` and `description` are required and allowed.
- `name` must match skill folder name.
- Minimize resource loading: read `references/` and `scripts/` only when needed.

### 8.1 Layered Skill Design (Recommended, Not Mandatory)

Use this pattern for complex or brittle skills. Simple skills may use a lighter structure.

- Policy layer (`SKILL.md`): capture intent, constraints, success criteria, and boundaries.
- Strategy layer (`references/`): capture workflow variants, decision points, and recovery rules.
- Execution layer (`scripts/`): implement the current best-known deterministic path.

Boundary guidelines:

- Keep `SKILL.md` semantic and stable; avoid embedding fragile UI/runtime details.
- Treat scripts as execution assets, not the skill definition itself.
  Scripts can be either deterministic helpers (stable utility scripts) or inference-derived cache (best-known generated flow to reduce repeated reasoning).
- If scripts fail due to UI drift, prefer re-discovery/reasoning and repair rather than hard dependence on stale steps.
- Define success by business-state verification (for example, final list/state checks), not by click completion alone.

### 8.2 Terminology and Style Glossary (Recommended)

Use these terms consistently across repository docs and skill references.

- Skill: the capability package folder (`SKILL.md`, resources, tests).
- Policy layer: semantic intent and boundaries (`SKILL.md` body).
- Strategy layer: workflow reasoning and fallback guidance (`references/`).
- Execution layer: runnable implementation assets (`scripts/`).
- Deterministic helper script: stable utility script intentionally hand-authored for repeatable behavior.
- Inference-derived cache script: best-known execution flow generated/refined from prior runs to reduce repeated reasoning.
- Semantic action: interaction anchored by visible text, labels, and roles rather than brittle DOM paths.
- Business-state verification: success check based on final product state (for example `Published`/`Draft` list outcome), not just action completion.

Writing guidance:

- Prefer concise, decision-oriented language.
- Prefer behavior-level descriptions over tool-call transcripts.
- Avoid overloaded synonyms for the same concept in one document.

## 9. Commit Message Standards (Semantic First)

- Preferred format: `<type>(<scope>): <subject>` or `<type>: <subject>`.
- Subject should describe intent clearly; do not default to `update N files`.
- For mixed changes, prioritize the primary change in the subject (scripts/docs/refactor). Put test details in body when needed.
- Use `test:` only for pure test changes.

## 10. Testing and Regression

### 10.1 Functional Tests

Each skill should include test cases (for example `tests/test_regression.sh` or `tests/cases.yaml`) that:

- cover key paths,
- cover fallback branches,
- cover historically regression-prone scenarios.

### 10.2 Regression Evaluation

Prompt or generation-logic changes should be compared against a baseline:

- baseline vs new behavior,
- no regression on critical scenarios,
- must-pass cases for key behavior.

## 11. Suggested CI Gates

Recommended PR pipeline order:

1. `python3 scripts/validate_all.py`
2. Skill tests (run by changed scope)
3. Regression eval (threshold checks)

Any failure should block merge.

## 12. Branch and Commit Workflow Suggestions

- Branch naming: `feat/<skill-name>-<topic>`, `fix/<skill-name>-<topic>`
- Commit types: `feat(skill): ...`, `fix(skill): ...`, `refactor(skill): ...`, `chore(skill): ...`
- PR description should include: goal, impact scope, test results, regression results.

## 13. Quick Checklist

Before commit, confirm:

- `npm run skills:validate` passed,
- `SKILL.md` frontmatter is valid,
- naming and directory rules are satisfied,
- tests were added/updated for rule or logic changes,
- documentation matches actual behavior.
