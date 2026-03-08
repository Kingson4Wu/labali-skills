# labali-skills

Skills Monorepo，用于统一管理 `public/private` 技能与基础校验工具。

## Quick Start

```bash
# 初始化 skill
npm run skill:init -- <name> --path skills/public --resources scripts,references,assets

# 校验单个 skill
npm run skill:validate -- skills/public/<name>

# 校验全部 skill
npm run skills:validate
```

## Repository Layout

```text
skills/public/     # 可共享技能
skills/private/    # 私有技能
scripts/           # 初始化与校验脚本
```

## Documentation

- 开发规范与完整流程：`DEVELOPMENT.md`
- AI 协作规范：`AGENTS.md`
- 贡献指南：`CONTRIBUTING.md`
- 安全策略：`SECURITY.md`
- 变更记录：`CHANGELOG.md`
- 开源许可：`LICENSE` (MIT)
