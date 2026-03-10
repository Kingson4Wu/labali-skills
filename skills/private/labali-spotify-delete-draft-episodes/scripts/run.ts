import { type DeleteDraftEpisodesInputs } from "./core";
import { execute } from "./auto-executor";

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
  npx tsx skills/public/labali-spotify-delete-draft-episodes/scripts/run.ts \\
    --show_id "<spotify_show_id>" \\
    [--show_home_url https://creators.spotify.com/pod/show/<id>/home] \\
    [--show_name "Show Name"] \\
    [--delete_all_drafts true|false] \\
    [--max_delete 200] \\
    [--disable_deterministic_cache true|false] \\
    [--profile_dir ~/.chrome-spotify] \\
    [--cdp_port 9222] \\
    [--headed true]`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputs: DeleteDraftEpisodesInputs = {
    show_id: requiredString(args, "show_id"),
    show_home_url: optionalString(args, "show_home_url"),
    show_name: optionalString(args, "show_name"),
    delete_all_drafts: parseBoolean(args.delete_all_drafts, false),
    max_delete: optionalString(args, "max_delete"),
    disable_deterministic_cache: parseBoolean(args.disable_deterministic_cache, false),
    profile_dir: optionalString(args, "profile_dir"),
    cdp_port: optionalString(args, "cdp_port"),
    headed: parseBoolean(args.headed, true),
  };

  const result = await execute(inputs);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`spotify draft delete failed: ${message}`);
  process.exitCode = 1;
});
