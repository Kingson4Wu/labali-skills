# labali-spotify-delete-draft-episodes 使用说明

如何在对话里使用 `labali-spotify-delete-draft-episodes`：删除 Spotify for Creators 中 Draft 状态的单集。

说明：该 skill 当前位于 `skills/private`，用于内部使用和持续调优。

## 1) 用自然语言描述需求（不显式写 skill 名）

适用场景：你只描述目标，让代理自动判断并调用这个 skill。

必填信息：

- `show_id`：Spotify 节目 id（用于直接进入目标节目）

可选信息：

- `delete_all_drafts`：默认 `false`；设为 `true` 时删除全部 Draft
- `max_delete`：全量删除模式的安全上限（默认 `200`）
- `show_home_url`：节目主页 URL（不填时由 `show_id` 推导）
- `show_name`：节目名兜底
- `disable_deterministic_cache`：`true` 表示跳过 deterministic cache，直接走 policy executor
- `profile_dir`：Chrome 用户数据目录（默认 `~/.chrome-spotify`）
- `cdp_port`：Chrome DevTools 端口（默认 `9222`）
- `headed`：是否可视化浏览器（默认 `true`）

模式说明：

- 默认模式（`delete_all_drafts=false`）：只删除列表第一条 Draft。
- 全量模式（`delete_all_drafts=true`）：循环删除全部 Draft，并最终校验 Draft 为空。

### 完整 Prompt 示例（自然语言）

```text
请帮我删除这个 Spotify 节目的一条 Draft。
show_id=<show_id>
使用默认模式，只删第一条后停止。
```

## 2) 显式指定 skill 来使用

适用场景：你希望强制使用这个 skill。

推荐写法：在 prompt 中显式写 skill 名（例如 `$labali-spotify-delete-draft-episodes`）。

### 完整 Prompt 示例（删除第一条）

```text
请使用 $labali-spotify-delete-draft-episodes 执行：
show_id=<show_id>
delete_all_drafts=false
cdp_port=9222
headed=true

只删除第一条 Draft，然后停止。
```

### 完整 Prompt 示例（删除全部）

```text
请使用 $labali-spotify-delete-draft-episodes 执行：
show_id=<show_id>
delete_all_drafts=true
max_delete=200
cdp_port=9222
headed=true

删除全部 Draft，并确认 Draft 列表为空。
```

## 3) 最小信息模板（可复制）

```text
请清理 Spotify 节目的 Draft：
show_id:
delete_all_drafts（true/false，默认 false）：
max_delete（可选）：
```
