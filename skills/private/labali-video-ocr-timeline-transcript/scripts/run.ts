import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __skillRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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

function optionalFlag(args: ArgMap, key: string): boolean {
  return args[key] === true;
}

function printUsage(): void {
  console.log(`Usage:\n  npx tsx skills/private/labali-video-ocr-timeline-transcript/scripts/run.ts \\\n    --video_path "/path/to/video.mp4" \\\n    [--output_dir "/path/to/output"] \\\n    [--adaptive_mode smart] \\\n    [--fps 0.5] \\\n    [--scene 0.3] \\\n    [--max_gap 0.8] \\\n    [--languages "zh-Hans,zh-Hant,en"] \\\n    [--recognition_level accurate] \\\n    [--chunk_size 80] \\\n    [--chunk_overlap 10] \\\n    [--merge_similarity 0.9] \\\n    [--merge_max_gap 2.0] \\\n    [--debug] \\\n    [--image_format jpg] \\\n    [--cleanup_frames]`);
}

function buildPythonCmd(scriptPath: string): { cmd: string; leadArgs: string[] } {
  const runner = (process.env.LABALI_PYTHON_RUNNER ?? "uv").trim();
  if (runner === "system") {
    // PYTHON_BIN lets advanced users point to a specific interpreter in system mode
    const pythonBin = process.env.PYTHON_BIN?.trim() || "python3";
    return { cmd: pythonBin, leadArgs: [scriptPath] };
  }
  const uvCheck = spawnSync("uv", ["--version"], { stdio: "pipe" });
  if (uvCheck.error || uvCheck.status !== 0) {
    console.error("[labali] uv is required but not found.");
    console.error("  Install: curl -LsSf https://astral.sh/uv/install.sh | sh");
    console.error("  Or use your existing Python: export LABALI_PYTHON_RUNNER=system");
    process.exit(1);
  }
  return { cmd: "uv", leadArgs: ["run", "--project", __skillRoot, "python", scriptPath] };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const videoPath = requiredString(args, "video_path");
  const outputDir = optionalString(args, "output_dir");
  const adaptiveMode = optionalString(args, "adaptive_mode");
  const fps = optionalString(args, "fps");
  const scene = optionalString(args, "scene");
  const maxGap = optionalString(args, "max_gap");
  const languages = optionalString(args, "languages");
  const recognitionLevel = optionalString(args, "recognition_level");
  const chunkSize = optionalString(args, "chunk_size");
  const chunkOverlap = optionalString(args, "chunk_overlap");
  const mergeSimilarity = optionalString(args, "merge_similarity");
  const mergeMaxGap = optionalString(args, "merge_max_gap");
  const debug = optionalFlag(args, "debug");
  const imageFormat = optionalString(args, "image_format");
  const cleanupFrames = optionalFlag(args, "cleanup_frames");

  const scriptPath = `${__skillRoot}/scripts/video-ocr-timeline.py`;
  const scriptArgs = ["--video_path", videoPath];

  if (outputDir) scriptArgs.push("--output_dir", outputDir);
  if (adaptiveMode) scriptArgs.push("--adaptive_mode", adaptiveMode);
  if (fps) scriptArgs.push("--fps", fps);
  if (scene) scriptArgs.push("--scene", scene);
  if (maxGap) scriptArgs.push("--max_gap", maxGap);
  if (languages) scriptArgs.push("--languages", languages);
  if (recognitionLevel) scriptArgs.push("--recognition_level", recognitionLevel);
  if (chunkSize) scriptArgs.push("--chunk_size", chunkSize);
  if (chunkOverlap) scriptArgs.push("--chunk_overlap", chunkOverlap);
  if (mergeSimilarity) scriptArgs.push("--merge_similarity", mergeSimilarity);
  if (mergeMaxGap) scriptArgs.push("--merge_max_gap", mergeMaxGap);
  if (debug) scriptArgs.push("--debug");
  if (imageFormat) scriptArgs.push("--image_format", imageFormat);
  if (cleanupFrames) scriptArgs.push("--cleanup_frames");

  const { cmd, leadArgs } = buildPythonCmd(scriptPath);
  const result = spawnSync(cmd, [...leadArgs, ...scriptArgs], {
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`video ocr timeline failed: ${message}`);
  process.exitCode = 1;
});
