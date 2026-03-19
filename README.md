# labali-skills

[中文](README.zh-CN.md)

A skills monorepo for managing reusable skills.

## Public Skills

| Skill | Function |
| --- | --- |
| [`labali-git-auto-commit-rewrite`](skills/public/labali-git-auto-commit-rewrite/README.md) | Stage all changes, generate a normalized conventional commit message, and commit locally. |
| [`labali-spotify-publish-episode`](skills/public/labali-spotify-publish-episode/README.md) | Browser-only semantic automation for creating and publishing Spotify podcast episodes. |

## Install

### Claude Code

Symlink skills into `~/.claude/skills/` so Claude Code can discover them as slash commands:

```bash
mkdir -p ~/.claude/skills

# Install a single skill
ln -s /absolute/path/to/labali-skills/skills/public/labali-git-auto-commit-rewrite \
      ~/.claude/skills/labali-git-auto-commit-rewrite

# Or install all public skills at once
for d in /absolute/path/to/labali-skills/skills/public/*/; do
  ln -s "$d" ~/.claude/skills/"$(basename "$d")"
done
```

Invoke in Claude Code:

```
/labali-git-auto-commit-rewrite
/labali-spotify-publish-episode
```

Alternatively, load skills for a single session without symlinking:

```bash
claude --add-dir /absolute/path/to/labali-skills/skills/public/labali-git-auto-commit-rewrite
```

### Other agents (Codex / OpenAI-compatible)

Install via the `skills` CLI:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

Note: `--skill` must match the published skill name.

Or symlink manually into `~/.agents/skills/`:

```bash
mkdir -p ~/.agents/skills
ln -s /absolute/path/to/labali-skills/skills/public/labali-git-auto-commit-rewrite ~/.agents/skills/
```

## Local Development

```bash
git clone git@github.com:Kingson4Wu/labali-skills.git
cd labali-skills
```

Validate all skills before committing:

```bash
npm run skills:validate   # check skill structure
npm run check:chinese     # check no Chinese in doc/config files
```
