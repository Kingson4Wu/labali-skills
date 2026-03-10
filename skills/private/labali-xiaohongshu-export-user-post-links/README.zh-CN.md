# labali-xiaohongshu-export-user-post-links 使用说明

这个 skill 用于从小红书用户主页提取全部帖子链接，并写入本地文件。

当前输出规则：
- 每行一个帖子链接
- 自动去重
- 默认包含 `xsec_token` 和 `xsec_source=pc_user`
- 可选 canonical 模式，仅输出 `https://www.xiaohongshu.com/explore/<note_id>`

## 1) 安装与更新

从 GitHub 安装：

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-xiaohongshu-export-user-post-links
```

更新到最新版本：再次执行安装命令。

## 2) 快速使用

```bash
npx tsx skills/private/labali-xiaohongshu-export-user-post-links/scripts/run.ts \
  --profile_url "https://www.xiaohongshu.com/user/profile/<user_id>?xsec_token=...&xsec_source=pc_search" \
  --output_path "/absolute/output/path/or/dir"
```

可选参数：
- `--include_token true|false`（默认 `true`）
- `--profile_dir ~/.chrome-labali`
- `--cdp_port 9222`
- `--timeout_ms 90000`
- `--max_scroll_rounds 80`

如果不传 `profile_url` 或 `output_path`，脚本会交互式询问。

## 3) 执行流程

1. 通过 CDP 启动/复用 Chrome（`open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=...`）。
2. 通过 CDP 建立连接。
3. 打开小红书首页并检查登录状态。
4. 如未登录，暂停等待手动登录。
5. 打开目标用户主页链接。
6. 从页面状态提取帖子卡片：`window.__INITIAL_STATE__.user.notes._value`。
7. 循环滚动页面触发分页加载。
8. 连续多轮无新增后停止。
9. 组装 `/explore/<note_id>` 链接（按配置可带 token）。
10. 去重并写入输出文件。

## 4) 技术实现方法

执行技术栈：
- 浏览器启动：系统命令（`open -na "Google Chrome" ... --remote-debugging-port=<port>`）
- CDP 通信：Playwright `connectOverCDP`
- 数据提取：
  - 主路径：`window.__INITIAL_STATE__.user.notes._value`
  - 从帖子卡片对象解析 `noteId` 和 `xsecToken`
- 分页策略：持续滚动 + 停滞轮次阈值停止
- 输出格式：纯文本文件，每行一个 URL

## 5) 输出结构

当 `--output_path` 是文件时：

```text
/abs/path/xhs-user-<user_id>-post-links.txt
```

当 `--output_path` 是目录时：

```text
<output_dir>/
  xhs-user-<user_id>-post-links.txt
```

每行示例：

```text
https://www.xiaohongshu.com/explore/<note_id>?xsec_token=...&xsec_source=pc_user
```

或 canonical 模式（`--include_token false`）：

```text
https://www.xiaohongshu.com/explore/<note_id>
```

## 6) 局限与脆弱点

这个 skill 目前是“结构化规则驱动”，不是完全自动推理。主要风险：

1. 前端状态结构漂移
- 提取依赖 `__INITIAL_STATE__.user.notes._value`。
- 小红书改 schema 后可能出现空结果或漏抓。

2. 分页加载行为不稳定
- 滚动加载受账号、设备、会话影响。
- 若懒加载异常，可能抓不全。

3. 登录与风控变化
- 登录判断是启发式（URL/文案关键词）。
- 风控策略变化可能导致列表不完整或为空。

4. token 可用性差异
- 某些卡片可能拿不到 `xsecToken`。
- 即使开启 token 输出，部分链接仍可能退化为 canonical 链接。

## 7) 常见问题排查

- 如果输出为空：
  - 先确认当前 Chrome 已登录小红书。
  - 用同一浏览器 profile 手动打开主页后再重试。
- 如果导出数量偏少：
  - 增大 `--max_scroll_rounds`。
  - 刷新主页后重跑。
- 如果输出路径不符合预期：
  - 显式传绝对路径并确认目录可写。

## 8) 后续维护建议

页面变化时建议优先修复：
1. `__INITIAL_STATE__` 提取路径
2. 分页滚动策略
3. 输出契约（每行一个链接 + 去重）
