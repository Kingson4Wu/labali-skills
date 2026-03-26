import { existsSync, statSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublishEpisodeInputs } from "./core";

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

function requiredString(args: ArgMap, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required flag: --${key}`);
  }
  return value;
}

function optionalString(args: ArgMap, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  return value;
}

function printUsage(): void {
  // Keep usage terse so it is easy to copy into terminal.
  console.log(`Usage:
  npx tsx skills/public/labali-spotify-publish-episode/scripts/run.ts \\
    --audio_file /abs/path/episode.mp3 \\
    --title "Episode title" \\
    --description "Episode description" \\
    --show_id "<spotify_show_id>" \\
    [--show_name "Show Name"] \\
    [--season_number 5] \\
    [--episode_number 21] \\
    [--cover_image /abs/path/cover.jpg] \\
    [--publish_at 2026-03-15T16:30:00Z] \\
    [--show_home_url https://creators.spotify.com/pod/show/<id>/home] \\
    [--confirm_publish true|false] \\
    [--disable_deterministic_cache true|false] \\
    [--profile_dir ~/.chrome-labali] \\
    [--cdp_port 9222] \\
    [--proxy_mode none|system|custom] \\
    [--proxy_server http://127.0.0.1:7890] \\
    [--headed true]`);
}

async function main(): Promise<void> {
  ensureDeps();
  const { execute } = await import("./auto-executor");

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const disableDeterministic = parseBoolean(args.disable_deterministic_cache, false);

  const inputs: PublishEpisodeInputs = {
    audio_file: requiredString(args, "audio_file"),
    title: requiredString(args, "title"),
    description: requiredString(args, "description"),
    show_id: requiredString(args, "show_id"),
    show_name: optionalString(args, "show_name"),
    disable_deterministic_cache: disableDeterministic,
    season_number: optionalString(args, "season_number"),
    episode_number: optionalString(args, "episode_number"),
    confirm_publish: parseBoolean(args.confirm_publish, true),
    cover_image: optionalString(args, "cover_image"),
    publish_at: optionalString(args, "publish_at"),
    show_home_url: optionalString(args, "show_home_url"),
    profile_dir: optionalString(args, "profile_dir"),
    cdp_port: optionalString(args, "cdp_port"),
    proxy_mode: optionalString(args, "proxy_mode"),
    proxy_server: optionalString(args, "proxy_server"),
    headed: parseBoolean(args.headed, true),
  };

  const result = await execute(inputs);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`spotify publish failed: ${message}`);
  process.exitCode = 1;
});
