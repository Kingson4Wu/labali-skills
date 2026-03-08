# labali-skills

[English](README.md)

用于管理可复用 skills 的仓库。

## 安装

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
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
```
