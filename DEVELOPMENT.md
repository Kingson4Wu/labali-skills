# Skill Monorepo Development Guide

本文档用于统一本仓库中 Skills 的安装方式、开发流程、工程规范与发布门禁。

## 1. 目标与范围

- 目标：将 Prompt/Skill 作为可维护的软件资产进行工程化管理。
- 范围：适用于本仓库 `skills/public` 与 `skills/private` 下的全部技能。

## 2. 核心架构分层

- Agent 层：负责任务编排与技能选择。
- Skill 层：能力包（`SKILL.md`、`agents/openai.yaml`、资源、测试）。
- Prompt 层：行为策略与输出约束（模块化、可版本化）。
- MCP/Tool 层：外部能力接口（文件、搜索、数据库、API）。

职责边界：Agent 决策，Skill 执行，Prompt 约束，Tool 提供能力。

## 3. 仓库结构约定

```text
.
├── skills/
│   ├── public/
│   └── private/
├── scripts/
│   ├── init_skill.py
│   ├── quick_validate.py
│   └── validate_all.py
├── .github/workflows/
└── DEVELOPMENT.md
```

每个 skill 目录至少包含：

- `SKILL.md`（必须，含 frontmatter：`name`、`description`）
- `agents/openai.yaml`（建议）

可选目录：

- `scripts/`
- `references/`
- `assets/`
- `tests/`
- `eval/`

## 4. 安装与使用

### 4.1 运行时安装（npx）

```bash
npx skills add github.com/<owner>/<repo> --skill <skill-name>
```

默认运行时目录通常为：

```text
~/.skills/skills/<skill-name>
```

若设置 `SKILLS_HOME`，则使用：

```text
$SKILLS_HOME/skills/<skill-name>
```

说明：`npx skills add` 安装的是运行时副本，不建议直接在该目录进行开发。

### 4.2 本仓库本地命令

```bash
# 初始化 skill
npm run skill:init -- <name> --path skills/public --resources scripts,references,assets

# 校验单个 skill
npm run skill:validate -- skills/public/<name>

# 校验全部 skill
npm run skills:validate
```

## 5. 开发流程（标准）

1. 在开发仓库创建/修改 skill（不要直接改运行时副本）。
2. 本地执行功能验证（必要时运行 skill 内脚本）。
3. 执行结构与元数据校验：`npm run skills:validate`。
4. 提交代码并发起 PR。
5. CI 自动执行校验与测试。
6. 合并后发布，用户通过 `npx skills add ...` 安装。

## 6. 本地调试推荐（软链接）

开发目录与运行目录分离，调试时使用 symlink：

```bash
ln -s <dev-skill-path> ~/.skills/skills/<skill-name>
```

优点：

- 修改即时生效
- 保留完整 git 历史
- 无需重复安装

## 7. Prompt 工程规范

- 禁止超大单文件 Prompt，采用模块化拆分。
- 公共规则抽取到共享片段，减少重复。
- Prompt 修改必须可追溯（版本、变更说明、评估结果）。

建议结构：

```text
skills/<name>/prompts/
  system.md
  includes/
    style-guide.md
    domain-rules.md
```

## 8. Skill 规范（强制）

- 命名：小写字母、数字、连字符，最长 64。
- Frontmatter：仅允许 `name` 与 `description` 必填字段。
- `name` 必须与 skill 文件夹同名。
- 资源最小化加载：只在需要时读取 references/scripts。

## 9. 测试与回归

### 9.1 功能测试

每个 skill 建议包含测试用例（如 `tests/cases.yaml`）：

- `input`
- `expected` 或 `expected_contains`

### 9.2 回归评估

Prompt 变更必须对比基线：

- `baseline score` vs `new score`
- 若低于阈值（例如 -2 分）则阻断合并
- 增加关键红线用例（must-pass）防止关键能力退化

## 10. 版本管理

Skill 必须采用语义化版本：

- `MAJOR`：行为或契约不兼容变化
- `MINOR`：新增能力或显著优化
- `PATCH`：修复与小幅调整

发布记录至少包含：

- skill version
- prompt hash（或版本标识）
- model
- benchmark score

## 11. CI 门禁建议

建议 PR 流水线顺序：

1. `python3 scripts/validate_all.py`
2. skill tests（按变更范围执行）
3. regression eval（阈值校验）

任一步失败即阻断合并。

## 12. 分支与提交流程建议

- 分支命名：`feat/<skill-name>-<topic>`、`fix/<skill-name>-<topic>`
- 提交信息：`feat(skill): ...`、`fix(skill): ...`、`chore(skill): ...`
- PR 描述需包含：变更目的、影响范围、测试结果、回归结果。

## 13. 快速检查清单

提交前至少确认：

- 已通过 `npm run skills:validate`
- `SKILL.md` frontmatter 合法
- 命名规范与目录结构正确
- Prompt 变更有测试或评估证据
- 版本号与变更等级匹配

