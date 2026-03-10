# labali-git-auto-commit-rewrite 使用说明

如何在对话里使用 `labali-git-auto-commit-rewrite`：基于当前改动生成清晰规范的 conventional commit 信息并提交全部改动。

说明：`scripts/clean_commit.sh` 是 skill 内置强制步骤，每次提交后都会自动执行。

## 1) 安装与更新

从 GitHub 安装：

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
```

更新到最新版本（再次执行安装命令）

## 2) 用自然语言描述需求（不显式写 skill 名）

适用场景：你只描述目标，让代理自动判断并调用对应 skill。

建议提供的信息：

- 提交范围（通常是当前仓库全部改动）
- 提交意图摘要
- 可选的提交风格偏好（`type(scope): subject`）
- 可选措辞约束（例如 subject 尽量精炼、72 字符以内）

### 完整 Prompt 示例（自然语言）

```text
请把当前仓库所有改动提交到 git。
请根据实际 diff 生成清晰且规范的 conventional commit 信息。
subject 要简洁明确，body 用有意义的 bullet points 描述关键改动。
请返回最终 commit hash 和最终 subject。
```

## 3) 显式指定 skill 来使用

适用场景：你希望强制使用这个 skill 执行。

推荐写法：在 prompt 中显式写出 skill 名（例如 `$labali-git-auto-commit-rewrite` 或 `labali-git-auto-commit-rewrite`）。

信息提供建议：

- 明确要求提交当前全部改动
- 提供可选的提交信息偏好
- 要求返回最终 hash 和 subject

### 完整 Prompt 示例（显式指定 skill）

```text
请使用 $labali-git-auto-commit-rewrite 执行这次提交。
请把当前仓库所有改动一次性提交，并生成高质量 conventional commit 信息。
subject 要具体、动作导向；body 需要 2-6 条 bullet，按改动分组描述。
当改动涉及多个主题时，不要只用“update”或“align”这种过于笼统的表达。
提交后请返回：
1) 最终 commit hash
2) 最终 commit subject
```

## 4) 最小信息模板（可复制）

```text
请提交当前仓库全部改动。
提交意图：
期望 type/scope（可选）：
期望措辞约束（可选）：
请返回最终 hash 和 subject。
```
