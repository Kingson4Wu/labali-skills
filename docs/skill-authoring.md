# Skill Authoring Guide

Reference this document when creating or modifying a skill. For content design principles, NEVER list guidelines, skill content patterns, and loading trigger techniques, see `docs/skill-reference.md`.

## Skill Execution Types

Execution types describe how a skill operates at runtime. They determine which layers and files a skill needs. Types are **reference models**, not required declarations — a skill is not required to declare its type, and types evolve as requirements change.

| Type | Description |
|------|-------------|
| `browser` | Playwright + Chrome CDP; operates web UI semantically |
| `policy` | Pure Claude Code reasoning; no scripts needed |
| `cli` | Wraps command-line tools or scripts (Python, shell, TypeScript) |
| `hybrid` | AI reasoning combined with script assistance |

## Required Files

Only `SKILL.md` is universally required. All other files are determined by execution type.

## Layer Requirements by Execution Type

| Layer | Location | `browser` | `policy` | `cli` | `hybrid` |
|-------|----------|-----------|----------|-------|---------|
| Policy | `SKILL.md` | required | required | required | required |
| Strategy | `references/` | required | recommended | optional | recommended |
| Execution | `scripts/` | required | not needed | required | required |

## Optional Files (all types)

`skill.yaml` (input schema), `tests/`, `assets/`

## Dependency Management

Each skill's dependencies are fully isolated — no cross-skill contamination, no system environment pollution.

### TypeScript skills (`browser`, `cli`, `hybrid` with `.ts` scripts)

- Add `package.json` at the **skill root** with `"engines": { "node": ">=20" }`.
- Run `pnpm install --dir <skill_root> --lockfile-only` to generate `pnpm-lock.yaml`.
- `scripts/run.ts` must use `ensureDeps()` (see template below) which auto-installs via `pnpm` on first run and re-installs when `package.json` changes. Call it before importing any third-party module.
- `pnpm` uses a global content-addressable store (`~/.pnpm-store`) — multiple skills sharing the same package version use hardlinks, so disk space is not duplicated.

```typescript
import { existsSync, statSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function ensureDeps(): void {
  const pkgPath = `${__skillRoot}/package.json`;
  const nmPath = `${__skillRoot}/node_modules`;
  const needsInstall = !existsSync(nmPath) ||
    statSync(pkgPath).mtimeMs > statSync(nmPath).mtimeMs;
  if (needsInstall) {
    console.log("[setup] Installing dependencies...");
    const pnpmCheck = spawnSync("pnpm", ["--version"], { stdio: "pipe" });
    if (pnpmCheck.error || pnpmCheck.status !== 0) {
      console.error("[labali] pnpm is required but not found.");
      console.error("  Install: npm install -g pnpm");
      process.exit(1);
    }
    execSync("pnpm install", { cwd: __skillRoot, stdio: "inherit" });
  }
}
```

### Python skills (`cli`, `hybrid` with `.py` scripts)

- Add `pyproject.toml` at the **skill root** with `requires-python` and version-pinned `dependencies`.
- Run `uv lock` in the skill root to generate `uv.lock`.
- In `scripts/run.ts`, use `buildPythonCmd()` (see template below) to invoke the Python script via `uv run`. `uv` auto-creates an isolated `.venv` at the skill root on first run.
- `uv` uses a global cache (`~/.cache/uv`) with hardlinks — disk space is not duplicated across skills sharing the same package version.
- Users can opt out of uv isolation by setting `LABALI_PYTHON_RUNNER=system`, which falls back to `python3` from PATH.

```typescript
function buildPythonCmd(scriptPath: string): { cmd: string; leadArgs: string[] } {
  const runner = (process.env.LABALI_PYTHON_RUNNER ?? "uv").trim();
  if (runner === "system") {
    return { cmd: "python3", leadArgs: [scriptPath] };
  }
  const uvCheck = spawnSync("uv", ["--version"], { stdio: "pipe" });
  if (uvCheck.error || uvCheck.status !== 0) {
    console.error("[labali] uv is required but not found.");
    console.error("  Install: curl -LsSf https://astral.sh/uv/install.sh | sh");
    console.error("  Or use your existing Python: export LABALI_PYTHON_RUNNER=system");
    process.exit(1);
  }
  return { cmd: "uv", leadArgs: ["run", "--project", __skillRoot, "python", scriptPath] };
}
```

`pyproject.toml` template:

```toml
[project]
name = "labali-<skill-name>"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "some-package>=1.0",
]
```

Also keep a `requirements.txt` with a comment noting it is for system-mode reference only.

### Scripts using only built-ins

No dependency file needed.
