import { type PublishEpisodeInputs } from "./core";
import { executeDeterministic } from "./cache/deterministic";

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
  console.log(`Usage:
  npx tsx skills/public/labali-spotify-publish-episode/scripts/run_deterministic.ts \\
    --audio_file /abs/path/episode.mp3 \\
    --title "Episode title" \\
    --description "Episode description" \\
    --show_id "<spotify_show_id>" \\
    [--show_name "Show Name"] \\
    [--season_number 1] \\
    [--episode_number 1] \\
    [--publish_at "2026-07-03T21:00:00+08:00"] \\
    [--show_home_url https://creators.spotify.com/pod/show/<id>/home] \\
    [--profile_dir ~/.chrome-labali] \\
    [--cdp_port 9222] \\
    [--proxy_mode none|system|custom] \\
    [--proxy_server http://127.0.0.1:7890]`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputs: PublishEpisodeInputs = {
    audio_file: requiredString(args, "audio_file"),
    title: requiredString(args, "title"),
    description: requiredString(args, "description"),
    show_id: requiredString(args, "show_id"),
    show_name: optionalString(args, "show_name"),
    season_number: optionalString(args, "season_number"),
    episode_number: optionalString(args, "episode_number"),
    publish_at: optionalString(args, "publish_at"),
    show_home_url: optionalString(args, "show_home_url"),
    cdp_port: optionalString(args, "cdp_port"),
    profile_dir: optionalString(args, "profile_dir"),
    proxy_mode: optionalString(args, "proxy_mode"),
    proxy_server: optionalString(args, "proxy_server"),
    headed: parseBoolean(args.headed, true),
    confirm_publish: true,
  };

  const result = await executeDeterministic(inputs);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`spotify deterministic publish failed: ${message}`);
  process.exitCode = 1;
});
