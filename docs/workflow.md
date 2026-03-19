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

## CI Gates

PR pipeline order:

1. `npm run skills:validate`
2. `npm run check:chinese`
3. Skill tests (scoped to changed skills)

Any failure blocks merge.
