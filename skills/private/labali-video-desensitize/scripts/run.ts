import { spawnSync } from "node:child_process";

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): ArgMap {
  const args: ArgMap = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
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

function requiredString(args: ArgMap, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required --${key}`);
  }
  return value.trim();
}

function printUsage(): void {
  console.log(`Usage:\n  npx tsx skills/private/labali-video-desensitize/scripts/run.ts \\\n    --input_video "/path/to/input.mp4" \\\n    --output_video "/path/to/output.mp4" [--strict]`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputVideo = requiredString(args, "input_video");
  const outputVideo = requiredString(args, "output_video");
  const strict = Boolean(args.strict);

  const scriptArgs = [
    "skills/private/labali-video-desensitize/scripts/sanitize-video.sh",
    inputVideo,
    outputVideo,
  ];

  if (strict) {
    scriptArgs.push("--strict");
  }

  const result = spawnSync("bash", scriptArgs, {
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`video desensitize failed: ${message}`);
  process.exitCode = 1;
});
