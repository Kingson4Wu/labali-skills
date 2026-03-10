# labali-skills

[English](README.md)

用于管理可复用 skills 的仓库。

## Public Skills

| Skill | 功能描述 |
| --- | --- |
| [`labali-git-auto-commit-rewrite`](skills/public/labali-git-auto-commit-rewrite/README.zh-CN.md) | 一键暂存全部改动，生成并规范化 conventional commit 信息并本地提交。 |
| [`labali-spotify-publish-episode`](skills/public/labali-spotify-publish-episode/README.zh-CN.md) | 基于浏览器语义交互的 Spotify 播客创建与发布自动化 skill。 |

## 安装

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

说明：`--skill` 必须与发布的 skill 名称一致。

## 本地开发

```bash
git clone git@github.com:Kingson4Wu/labali-skills.git
```

建立软链接：

```bash
# 确保本地 skills 目录存在
mkdir -p ~/.agents/skills

# 安装全部 public skills
ln -s ~/programming/kingson4wu/labali-skills/skills/public/* ~/.agents/skills/

# 仅安装单个 skill
ln -s ~/programming/kingson4wu/labali-skills/skills/public/labali-git-auto-commit-rewrite ~/.agents/skills/
ln -s ~/programming/kingson4wu/labali-skills/skills/public/labali-spotify-publish-episode ~/.agents/skills/
```

提交前校验：

```bash
npm run skills:validate
```
