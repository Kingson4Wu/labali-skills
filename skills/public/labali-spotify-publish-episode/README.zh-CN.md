# labali-spotify-publish-episode 使用说明

如何在对话里使用 `labali-spotify-publish-episode` 这个 skill 来发布 Spotify for Creators 播客单集。

## 1) 安装与更新

从 GitHub 安装：

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

更新到最新版本（再次执行安装命令）

## 2) 用自然语言描述需求（不显式写 skill 名）

适用场景：你只想直接说目标，让代理自动判断并调用对应 skill。

你至少需要提供以下信息（必填）：

- `audio_file`：音频文件路径（绝对路径或相对工作区路径）
- `title`：单集标题
- `description`：单集描述
- `show_id`：Spotify 节目 id（用于直接打开目标节目页）

可选信息（按需提供）：

- `show_name`：节目名称（仅兜底）
- `season_number`：季号（正整数）
- `episode_number`：集号（正整数）
- `cover_image`：封面图路径
- `publish_at`：定时发布时间（ISO-8601）
- `confirm_publish`：是否执行最终发布（`false` 可用于只跑到发布前检查）
- `show_home_url`：节目主页 URL（不填时会由 `show_id` 自动推导）
- `disable_deterministic_cache`：`true` 表示跳过 deterministic cache，直接走 policy executor
- `profile_dir`：Chrome 用户数据目录（默认 `~/.chrome-spotify`，用于复用登录态）
- `cdp_port`：Chrome DevTools 端口（默认 `9222`）；会优先复用已有会话，未检测到时自动拉起 Chrome
- `headed`：是否可视化浏览器（默认 `true`）

### 完整 Prompt 示例（自然语言）

```text
请帮我在 Spotify for Creators 发布一集播客。
节目ID：<show_id>
音频文件：/absolute/path/to/audio/2026-03-10-episode-18.mp3
标题：Episode 18 - Agent Reliability in Production
描述：这一集我们讨论多层执行架构、策略缓存和回归验证实践。
季号：2
集号：18
封面图：/absolute/path/to/audio/cover-ep18.jpg
定时发布时间：2026-03-12T09:00:00+08:00
请直接发布，不要停在确认页。
```

## 3) 显式指定 skill 来使用

适用场景：你希望强制使用这个 skill，而不是让代理自行判断。

推荐写法：在 prompt 中显式写出 skill 名（例如 `$labali-spotify-publish-episode` 或直接写 `labali-spotify-publish-episode`）。

信息提供建议：

- 必填字段是：`audio_file`、`title`、`description`、`show_id`
- 其他参数按你需要的发布策略补充（立即发布、定时发布、仅预检查等）

### 完整 Prompt 示例（显式指定 skill）

```text
请使用 $labali-spotify-publish-episode 执行这次发布任务，并严格按下面参数运行：
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

## 4) 最小信息模板（可复制）

```text
请发布 Spotify 播客单集：
节目ID（show_id）：
音频路径（audio_file）：
标题（title）：
描述（description）：
是否立即发布（confirm_publish=true/false）：
（可选）定时发布时间（publish_at）：
```

## 5) 批量上传 Prompt 模板（可复制）

适用场景：你要连续发布多集，且参数结构一致（通常是同一个 `show_id`）。

建议写法：明确要求“按列表顺序逐条执行”，并要求“每条发布后再继续下一条”。

```text
请使用 $labali-spotify-publish-episode 批量发布以下播客单集。
要求：
1. 按列表顺序逐条执行；
2. 每发布完成 1 条后再继续下一条；
3. 每条都验证标题出现在 Published 且不在 Draft；
4. 若任一条失败，先停止并返回失败条目的原因与当前页面状态。

全局参数：
show_id=<show_id>

任务列表：
- [1]
  audio_file=/absolute/path/episode-01.mp3
  title=第1集标题
  description=第1集描述
  season_number=6
  episode_number=1
- [2]
  audio_file=/absolute/path/episode-02.mp3
  title=第2集标题
  description=第2集描述
  season_number=6
  episode_number=2
- [3]
  audio_file=/absolute/path/episode-03.mp3
  title=第3集标题
  description=第3集描述
  season_number=6
  episode_number=3
```

如果你希望“立即发布”，不要填写 `publish_at`；如果要定时发布，请在每条任务中单独提供该字段。
