# Development Workflow

Reference this document for installation, local commands, and development flow.

## Installation

### Claude Code (symlink)

```bash
ln -s /path/to/labali-skills/skills/public/<skill-name> ~/.claude/skills/<skill-name>
```

Restart Claude Code to pick up the new skill.

### Other agents (symlink)

```bash
ln -s /path/to/labali-skills/skills/public/<skill-name> ~/.agents/skills/<skill-name>
```

Use symlinks so changes take effect immediately without reinstall. Never edit runtime directories directly.

## Local Commands

```bash
npm run skill:init          # Scaffold a new skill interactively
npm run skill:validate      # Validate a single skill's structure and metadata
npm run skills:validate     # Validate all skills (required before every PR)
npm run check:chinese       # Check for Chinese characters in doc/config files
```

## Standard Development Flow

1. Create or update skills in this repository (not in runtime copies).
2. Run functional checks locally.
3. Run `npm run skills:validate` and `npm run check:chinese`.
4. If skill behavior logic changes, run corresponding tests.
5. Commit and open a PR.

## Environment Isolation

Skills use isolated dependency environments — no cross-skill contamination and no pollution of the user's system.

| Runtime | Isolation unit | Shared storage |
|---------|---------------|----------------|
| Python (uv) | `.venv/` at skill root (auto-created by `uv run`) | `~/.cache/uv` — hardlinks, bytes not duplicated |
| TypeScript (pnpm) | `node_modules/` at skill root (auto-installed by `ensureDeps()`) | `~/.pnpm-store` — hardlinks, bytes not duplicated |

### Prerequisites

- **Python skills**: requires [`uv`](https://docs.astral.sh/uv/)
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **TypeScript skills**: requires [`pnpm`](https://pnpm.io/)
  ```bash
  npm install -g pnpm
  ```

### User choice (Python)

Set `LABALI_PYTHON_RUNNER=system` to bypass `uv` and use `python3` from PATH directly:

```bash
export LABALI_PYTHON_RUNNER=system
```

This is useful if you manage your own Python environment (conda, pyenv, etc.).

### Troubleshooting

| Error | Fix |
|-------|-----|
| `[labali] uv is required but not found` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `[labali] pnpm is required but not found` | `npm install -g pnpm` |
| Python deps not picked up in system mode | Install manually: `pip install -r requirements.txt` |
| Stale node_modules after dep update | Delete `node_modules/`, re-run the skill |
| `.venv` broken | Delete `.venv/` in skill root, re-run the skill |

## CI Gates

PR pipeline order:

1. `npm run skills:validate`
2. `npm run check:chinese`
3. Skill tests (scoped to changed skills)

Any failure blocks merge.
