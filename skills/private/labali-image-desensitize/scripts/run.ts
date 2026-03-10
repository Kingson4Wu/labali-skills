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
  console.log(`Usage:\n  npx tsx skills/private/labali-image-desensitize/scripts/run.ts \\\n    --input_image "/path/to/input.jpg" \\\n    --output_image "/path/to/output.jpg" [--strict]`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputImage = requiredString(args, "input_image");
  const outputImage = requiredString(args, "output_image");
  const strict = Boolean(args.strict);

  const scriptArgs = ["skills/private/labali-image-desensitize/scripts/sanitize-image.sh", inputImage, outputImage];
  if (strict) {
    scriptArgs.push("--strict");
  }

  const result = spawnSync(
    "bash",
    scriptArgs,
    {
      stdio: "inherit",
      env: process.env,
    }
  );

  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`image desensitize failed: ${message}`);
  process.exitCode = 1;
});
