import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DownloadPostInputs } from "./core";

const __skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function ensureDeps(): void {
  if (!existsSync(`${__skillRoot}/node_modules`)) {
    console.log("[setup] Installing dependencies (first run)...");
    execSync("npm install", { cwd: __skillRoot, stdio: "inherit" });
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
  npx tsx skills/private/labali-xiaohongshu-download-post-assets/scripts/run.ts \\
    --post_url "https://www.xiaohongshu.com/explore/<note_id>" \\
    --output_dir "/absolute/or/relative/output/path" \\
    [--profile_dir ~/.chrome-labali] \\
    [--cdp_port 9222] \\
    [--timeout_ms 90000] \\
    [--overwrite true|false] \\
    [--include_comments true|false]`);
}

async function main(): Promise<void> {
  ensureDeps();
  const { execute } = await import("./executor");

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputs: DownloadPostInputs = {
    post_url: optionalString(args, "post_url"),
    output_dir: optionalString(args, "output_dir"),
    profile_dir: optionalString(args, "profile_dir"),
    cdp_port: optionalString(args, "cdp_port"),
    timeout_ms: optionalNumber(args, "timeout_ms"),
    overwrite: parseBoolean(args.overwrite, false),
    include_comments: parseBoolean(args.include_comments, false),
  };

  const result = await execute(inputs);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`xhs download failed: ${message}`);
  process.exitCode = 1;
});
