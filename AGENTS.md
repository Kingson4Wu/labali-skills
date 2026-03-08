# AGENTS.md

本文件定义 AI 助手在本仓库中的协作规则。目标是让后续 AI 辅助编程稳定、可复现、低风险。

## 1. 项目定位

- 仓库类型：Skills Monorepo
- 主要目录：`skills/public`、`skills/private`
- 当前工具链：Python 脚本 + npm scripts
- 规范主文档：`DEVELOPMENT.md`

当本文件与口头请求冲突时：

1. 用户当前请求优先
2. 其次遵循本文件
3. 最后参考 `DEVELOPMENT.md`

## 2. AI 工作目标

- 优先完成可执行变更，不只停留在建议。
- 保持改动最小闭环：实现 + 必要校验 + 结果说明。
- 保持仓库整洁，不引入无关文件或临时产物。

## 3. 仓库结构认知

```text
.
├── skills/
│   ├── public/
│   └── private/
├── scripts/
│   ├── init_skill.py
│   ├── quick_validate.py
│   └── validate_all.py
├── DEVELOPMENT.md
├── README.md
└── AGENTS.md
```

## 4. 常用命令（优先使用）

- 初始化 skill：
  - `npm run skill:init -- <name> --path skills/public --resources scripts,references,assets`
- 校验单个 skill：
  - `npm run skill:validate -- skills/public/<name>`
- 校验全部 skill：
  - `npm run skills:validate`

如果只改文档，通常不需要额外安装依赖。

## 5. Skill 文件与命名规范

- skill 目录名：小写字母/数字/连字符，长度 <= 64。
- 每个 skill 最少包含：
  - `SKILL.md`（必须，frontmatter 仅 `name`、`description`）
  - `agents/openai.yaml`（建议）
- `SKILL.md` 的 `name` 必须与目录名一致。
- 可选目录：`scripts/`、`references/`、`assets/`、`tests/`、`eval/`。

## 6. 代码与文档变更原则

- 仅修改与当前任务直接相关的文件。
- 不重命名、不搬迁无关文件。
- 不删除用户已有内容，除非请求明确要求。
- 文档优先中文，命令与路径保持原文（英文）。
- README 保持简洁，详细规范放 `DEVELOPMENT.md`。

## 7. 执行流程（AI 操作模板）

1. 先读取相关文件（最小范围）。
2. 给出简短执行说明后再改文件。
3. 完成改动后执行必要校验（至少 `npm run skills:validate`，若变更影响 skill 结构）。
4. 输出变更结果：
   - 改了什么
   - 为什么这样改
   - 校验是否通过

## 8. 禁止事项

- 不要在运行时目录（如 `~/.skills/skills/...`）直接做开发性改动。
- 不要引入与任务无关的大型脚手架或依赖。
- 不要提交密钥、token、凭据或隐私数据。
- 不要伪造测试结果；无法执行时要明确说明。

## 9. 提交前检查清单

- 变更是否最小且可解释。
- 目录和命名是否符合规范。
- 文档是否与实际代码一致。
- 需要时已执行：`npm run skills:validate`。
- 最终说明包含文件路径与验证结论。

## 10. 面向后续扩展的约定

当仓库新增自动化测试后，按以下顺序执行：

1. `python3 scripts/validate_all.py`
2. skill tests（如存在）
3. regression eval（如存在）

新增脚本时优先放在 `scripts/`，并在 `README.md` 或 `DEVELOPMENT.md` 补充入口命令。
