# labali-skills

[中文](README.zh-CN.md)

A skills monorepo for managing reusable skills.

## Public Skills

| Skill | Function |
| --- | --- |
| [`labali-git-auto-commit-rewrite`](skills/public/labali-git-auto-commit-rewrite/SKILL.md) | Stage all changes, generate a normalized conventional commit message, and commit locally. |
| [`labali-spotify-publish-episode`](skills/public/labali-spotify-publish-episode/README.md) | Browser-only semantic automation for creating and publishing Spotify podcast episodes. |

## Install

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

Note: `--skill` must match the published skill name.

## Local Development

```bash
git clone git@github.com:Kingson4Wu/labali-skills.git
```

Create symlinks:

```bash
# Ensure local skills directory exists
mkdir -p ~/.agents/skills

# Install all public skills
ln -s ~/programming/kingson4wu/labali-skills/skills/public/* ~/.agents/skills/

# Install only one skill
ln -s ~/programming/kingson4wu/labali-skills/skills/public/labali-git-auto-commit-rewrite ~/.agents/skills/
ln -s ~/programming/kingson4wu/labali-skills/skills/public/labali-spotify-publish-episode ~/.agents/skills/
```

Validate before commit:

```bash
npm run skills:validate
```
