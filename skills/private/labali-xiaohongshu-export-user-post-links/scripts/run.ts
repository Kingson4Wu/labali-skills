import { existsSync, statSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExportUserPostLinksInputs } from "./core";

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

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): ArgMap {
  const args: ArgMap = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function optionalString(args: ArgMap, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value.trim();
}

function parseBoolean(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function optionalNumber(args: ArgMap, key: string): number | undefined {
  const value = optionalString(args, key);
  if (!value) {
    return undefined;
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }
  return n;
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx skills/private/labali-xiaohongshu-export-user-post-links/scripts/run.ts \\
    --profile_url "https://www.xiaohongshu.com/user/profile/<user_id>?xsec_token=..." \\
    --output_path "/absolute/or/relative/output/file-or-dir" \\
    [--include_token true|false] \\
    [--include_publish_time true|false] \\
    [--exclude_sticky true|false] \\
    [--limit 2] \\
    [--profile_dir ~/.chrome-labali] \\
    [--cdp_port 9222] \\
    [--timeout_ms 90000] \\
    [--max_scroll_rounds 80]`);
}

async function main(): Promise<void> {
  ensureDeps();
  const { execute } = await import("./executor");

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputs: ExportUserPostLinksInputs = {
    profile_url: optionalString(args, "profile_url"),
    output_path: optionalString(args, "output_path"),
    include_token: parseBoolean(args.include_token, true),
    include_publish_time: parseBoolean(args.include_publish_time, false),
    exclude_sticky: parseBoolean(args.exclude_sticky, false),
    limit: optionalNumber(args, "limit"),
    profile_dir: optionalString(args, "profile_dir"),
    cdp_port: optionalString(args, "cdp_port"),
    timeout_ms: optionalNumber(args, "timeout_ms"),
    max_scroll_rounds: optionalNumber(args, "max_scroll_rounds"),
  };

  const result = await execute(inputs);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`xhs user post links export failed: ${message}`);
  process.exitCode = 1;
});
