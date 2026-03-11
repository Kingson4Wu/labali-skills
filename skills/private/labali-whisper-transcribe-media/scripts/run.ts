import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

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

function optionalInteger(args: ArgMap, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --${key} value: ${value}`);
  }
  return parsed;
}

function optionalBoolean(args: ArgMap, key: string): boolean {
  return args[key] === true;
}

const MEDIA_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".webm",
  ".flv",
  ".wmv",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
]);

function isMediaFile(path: string): boolean {
  return MEDIA_EXTENSIONS.has(extname(path).toLowerCase());
}

function collectMediaFiles(inputPath: string): string[] {
  const abs = resolve(inputPath);
  if (!existsSync(abs)) {
    throw new Error(`Input path not found: ${inputPath}`);
  }

  const st = statSync(abs);
  if (st.isFile()) {
    if (!isMediaFile(abs)) {
      throw new Error(`Unsupported media file extension: ${inputPath}`);
    }
    return [abs];
  }

  if (!st.isDirectory()) {
    throw new Error(`Input path must be a media file or directory: ${inputPath}`);
  }

  const files: string[] = [];
  const queue = [abs];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const next = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(next);
        continue;
      }
      if (entry.isFile() && isMediaFile(next)) {
        files.push(next);
      }
    }
  }

  return files.sort();
}

function defaultTxtOutputPath(inputFile: string): string {
  const fileName = basename(inputFile);
  const stem = fileName.slice(0, fileName.length - extname(fileName).length);
  return join(dirname(inputFile), `${stem}_subtitles`, `${stem}.txt`);
}

function runScript(scriptArgs: string[]): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn("bash", scriptArgs, {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolvePromise(code ?? 1));
    child.on("error", () => resolvePromise(1));
  });
}

async function runSingleWithRetry(
  scriptArgs: string[],
  mediaPath: string,
  retry: number
): Promise<boolean> {
  let attempt = 0;
  while (attempt <= retry) {
    attempt += 1;
    if (attempt > 1) {
      console.log(`Retry ${attempt - 1}/${retry}: ${mediaPath}`);
    }
    const exitCode = await runScript(scriptArgs);
    if (exitCode === 0) return true;
  }
  return false;
}

function printUsage(): void {
  console.log(`Usage:\n  npx tsx skills/private/labali-whisper-transcribe-media/scripts/run.ts \\\n    --input_path \"/path/to/media_or_directory\" \\\n    [--output_text \"/path/to/output.txt\"] \\\n    [--language \"Chinese\"] \\\n    [--model \"medium\"] \\\n    [--task \"transcribe\"] \\\n    [--output_format \"all\"] \\\n    [--parallel 2] \\\n    [--retry 1] \\\n    [--dry_run] \\\n    [--force]`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputPath = requiredString(args, "input_path");
  const outputText = optionalString(args, "output_text");
  const language = optionalString(args, "language");
  const model = optionalString(args, "model");
  const task = optionalString(args, "task");
  const outputFormat = optionalString(args, "output_format");
  const parallel = Math.max(1, optionalInteger(args, "parallel", 1));
  const retry = optionalInteger(args, "retry", 1);
  const dryRun = optionalBoolean(args, "dry_run");
  const force = optionalBoolean(args, "force");

  const mediaFiles = collectMediaFiles(inputPath);
  if (mediaFiles.length === 0) {
    throw new Error(`No media files found in: ${inputPath}`);
  }
  if (outputText && mediaFiles.length > 1) {
    throw new Error("--output_text only supports single media input.");
  }

  const pending = mediaFiles.filter((filePath) => {
    if (force || outputText) return true;
    return !existsSync(defaultTxtOutputPath(filePath));
  });

  const skipped = mediaFiles.length - pending.length;
  console.log(`Found media files: ${mediaFiles.length}`);
  console.log(`Skip existing: ${force ? "disabled (--force)" : "enabled"}`);
  console.log(`Pending: ${pending.length}${skipped > 0 ? `, Skipped: ${skipped}` : ""}`);

  if (pending.length === 0) return;

  if (dryRun) {
    for (const filePath of pending) {
      console.log(`[dry-run] ${filePath}`);
    }
    return;
  }

  let cursor = 0;
  let successCount = 0;
  let failedCount = 0;
  const failedFiles: string[] = [];

  const workers = Array.from({ length: Math.min(parallel, pending.length) }, () =>
    (async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= pending.length) return;

        const filePath = pending[idx];
        console.log(`Start (${idx + 1}/${pending.length}): ${filePath}`);

        const scriptArgs = [
          "skills/private/labali-whisper-transcribe-media/scripts/transcribe-media.sh",
          "--input",
          filePath,
        ];

        if (outputText) scriptArgs.push("--output", outputText);
        if (language) scriptArgs.push("--language", language);
        if (model) scriptArgs.push("--model", model);
        if (task) scriptArgs.push("--task", task);
        if (outputFormat) scriptArgs.push("--output-format", outputFormat);

        const ok = await runSingleWithRetry(scriptArgs, filePath, retry);
        if (ok) {
          successCount += 1;
          console.log(`Done (${successCount}/${pending.length}): ${filePath}`);
        } else {
          failedCount += 1;
          failedFiles.push(filePath);
          console.error(`Failed: ${filePath}`);
        }
      }
    })()
  );

  await Promise.all(workers);

  console.log(
    `Summary: total=${mediaFiles.length}, pending=${pending.length}, success=${successCount}, failed=${failedCount}, skipped=${skipped}`
  );

  if (failedFiles.length > 0) {
    console.error("Failed files:");
    for (const filePath of failedFiles) {
      console.error(`- ${filePath}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`whisper transcribe failed: ${message}`);
  process.exitCode = 1;
});
