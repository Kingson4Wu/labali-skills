# labali-spotify-publish-episode 使用说明

如何使用 `labali-spotify-publish-episode` skill 在 Spotify for Creators 上发布播客单集。

## 快速开始

### 安装

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

### 必填信息

| 字段 | 说明 |
|------|------|
| `audio_file` | 音频文件路径（绝对路径或相对工作区路径） |
| `title` | 单集标题 |
| `description` | 单集描述 |
| `show_id` | Spotify 节目 ID（推荐）或 `show_home_url` 或 `show_name` |

### 可选参数

| 字段 | 说明 |
|------|------|
| `season_number` | 季号（正整数） |
| `episode_number` | 集号（正整数） |
| `cover_image` | 封面图路径 |
| `publish_at` | 定时发布时间（ISO-8601） |
| `confirm_publish` | 是否执行最终发布（`true`/`false`，默认 `true`） |
| `disable_deterministic_cache` | 跳过 deterministic cache（`true`/`false`，默认 `false`） |
| `profile_dir` | Chrome 用户数据目录（默认 `~/.chrome-spotify`） |
| `cdp_port` | Chrome DevTools 端口（默认 `9222`） |
| `headed` | 是否可视化浏览器（默认 `true`） |

---

## 使用模式

### 模式 1：自然语言（隐式技能选择）

直接描述目标，由代理自动选择并调用 skill。

**示例：**

```text
请帮我在 Spotify for Creators 发布一集播客。
节目 ID：<show_id>
音频文件：/absolute/path/to/audio/2026-03-10-episode-18.mp3
标题：Episode 18 - Agent Reliability in Production
描述：这一集我们讨论多层执行架构、策略缓存和回归验证实践。
季号：2
集号：18
封面图：/absolute/path/to/audio/cover-ep18.jpg
定时发布时间：2026-03-12T09:00:00+08:00
请直接发布，不要停在确认页。
```

### 模式 2：显式技能调用

通过命名 skill（`$labali-spotify-publish-episode`）强制使用此技能。

**示例：**

```text
请使用 $labali-spotify-publish-episode 执行这次发布任务，并严格按以下参数运行：
audio_file=/absolute/path/to/audio/2026-03-10-episode-19.mp3
title=Episode 19 - Deterministic Cache vs Policy Executor
description=对比 deterministic 轨迹缓存和 policy executor 的稳定性、速度与维护成本。
show_id=<show_id>
show_name=Labali AI Weekly
season_number=2
episode_number=19
publish_at=2026-03-15T10:30:00+08:00
confirm_publish=true
disable_deterministic_cache=false
profile_dir=~/.chrome-spotify
cdp_port=9222
headed=true

如果检测到未登录，请停下来提示我手动登录后继续。
发布完成后请验证该标题在 Published 中出现且不在 Draft 中。
```

---

## 模板

### 最小信息模板

```text
请发布 Spotify 播客单集：
节目 ID（show_id）：
音频路径（audio_file）：
标题（title）：
描述（description）：
是否立即发布（confirm_publish=true/false）：
（可选）定时发布时间（publish_at）：
```

### 批量上传模板

适用于在同一 `show_id` 下连续发布多集。

**要求：**
1. 按列表顺序逐条执行
2. 每发布完成 1 条后再继续下一条
3. 每条都验证标题出现在 Published 且不在 Draft
4. 若任一条失败，先停止并返回失败原因与当前页面状态

```text
请使用 $labali-spotify-publish-episode 批量发布以下播客单集。

全局参数：
show_id=<show_id>

任务列表：
- [1]
  audio_file=/absolute/path/episode-01.mp3
  title=第 1 集标题
  description=第 1 集描述
  season_number=6
  episode_number=1
- [2]
  audio_file=/absolute/path/episode-02.mp3
  title=第 2 集标题
  description=第 2 集描述
  season_number=6
  episode_number=2
- [3]
  audio_file=/absolute/path/episode-03.mp3
  title=第 3 集标题
  description=第 3 集描述
  season_number=6
  episode_number=3
```

**注意：** 立即发布时省略 `publish_at`；定时发布时为每条任务单独提供该字段。

---

## 更新

运行安装命令即可更新到最新版本：

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```
