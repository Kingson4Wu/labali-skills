import { execute } from "./executor";

const HELP_TEXT = `
Usage:
  npx tsx scripts/run.ts --user_url <url> [--output_dir <dir>] [--profile_dir <dir>] [--cdp_port <port>]
                         [--fixed_user_dir <dir>]
                         [--timeout_ms <ms>] [--overwrite true|false] [--max_posts <n>] [--include_videos true|false]
                         [--collect_links_only true|false]
`;

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid number value: ${value}`);
  return parsed;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP_TEXT.trim());
    return;
  }
  const args = parseArgs(process.argv.slice(2));

  const result = await execute({
    user_url: args.user_url,
    output_dir: args.output_dir,
    fixed_user_dir: args.fixed_user_dir,
    profile_dir: args.profile_dir,
    cdp_port: args.cdp_port,
    timeout_ms: parseNumber(args.timeout_ms),
    overwrite: parseBoolean(args.overwrite),
    max_posts: parseNumber(args.max_posts),
    include_videos: parseBoolean(args.include_videos),
    collect_links_only: parseBoolean(args.collect_links_only),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[douyin-downloader] ERROR: ${message}`);
  process.exitCode = 1;
});
