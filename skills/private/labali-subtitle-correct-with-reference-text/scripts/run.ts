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

function optionalString(args: ArgMap, key: string): string | null {
  const value = args[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function printUsage(): void {
  console.log(`Usage:\n  npx tsx skills/private/labali-subtitle-correct-with-reference-text/scripts/run.ts \\\n    --subtitle_path \"/path/to/input.srt\" \\\n    --reference_path \"/path/to/reference.txt\" \\\n    [--output_path \"/path/to/output.srt\"]`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const subtitlePath = requiredString(args, "subtitle_path");
  const referencePath = requiredString(args, "reference_path");
  const outputPath = optionalString(args, "output_path");

  const scriptArgs = [
    "skills/private/labali-subtitle-correct-with-reference-text/scripts/fix-subtitle-with-reference.py",
    "--subtitle_path",
    subtitlePath,
    "--reference_path",
    referencePath,
  ];

  if (outputPath) {
    scriptArgs.push("--output_path", outputPath);
  }

  const result = spawnSync("python3", scriptArgs, {
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`subtitle correction failed: ${message}`);
  process.exitCode = 1;
});
