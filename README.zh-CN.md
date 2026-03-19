# labali-skills

[English](README.md)

用于管理可复用 skills 的仓库。

## Public Skills

| Skill | 功能描述 |
| --- | --- |
| [`labali-git-auto-commit-rewrite`](skills/public/labali-git-auto-commit-rewrite/README.zh-CN.md) | 一键暂存全部改动，生成并规范化 conventional commit 信息并本地提交。 |
| [`labali-spotify-publish-episode`](skills/public/labali-spotify-publish-episode/README.zh-CN.md) | 基于浏览器语义交互的 Spotify 播客创建与发布自动化 skill。 |

## 安装

### Claude Code

将 skill 软链接到 `~/.claude/skills/`，Claude Code 会自动识别并以斜杠命令形式调用：

```bash
mkdir -p ~/.claude/skills

# 安装单个 skill
ln -s /绝对路径/labali-skills/skills/public/labali-git-auto-commit-rewrite \
      ~/.claude/skills/labali-git-auto-commit-rewrite

# 或一次性安装全部 public skills
for d in /绝对路径/labali-skills/skills/public/*/; do
  ln -s "$d" ~/.claude/skills/"$(basename "$d")"
done
```

在 Claude Code 中调用：

```
/labali-git-auto-commit-rewrite
/labali-spotify-publish-episode
```

也可以不软链接，仅在当前会话中加载：

```bash
claude --add-dir /绝对路径/labali-skills/skills/public/labali-git-auto-commit-rewrite
```

### 其他 agent（Codex / OpenAI 兼容）

通过 `skills` CLI 安装：

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

说明：`--skill` 必须与发布的 skill 名称一致。

或手动软链接到 `~/.agents/skills/`：

```bash
mkdir -p ~/.agents/skills
ln -s /绝对路径/labali-skills/skills/public/labali-git-auto-commit-rewrite ~/.agents/skills/
```

## 本地开发

```bash
git clone git@github.com:Kingson4Wu/labali-skills.git
cd labali-skills
```

提交前校验：

```bash
npm run skills:validate   # 检查 skill 结构
npm run check:chinese     # 检查文档/配置文件无中文
```
