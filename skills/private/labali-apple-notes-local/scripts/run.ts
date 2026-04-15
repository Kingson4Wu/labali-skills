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

function optionalBoolean(args: ArgMap, key: string): boolean | null {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value for --${key}: ${value}`);
}

function optionalNumber(args: ArgMap, key: string): number | null {
  const value = args[key];
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number value for --${key}: ${value}`);
  }
  return parsed;
}

function buildPythonCmd(scriptPath: string): { cmd: string; leadArgs: string[] } {
  const runner = (process.env.LABALI_PYTHON_RUNNER ?? "uv").trim();
  if (runner === "system") {
    return { cmd: "python3", leadArgs: [scriptPath] };
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

function printUsage(): void {
  console.log(`Usage:
  npx tsx skills/private/labali-apple-notes-local/scripts/run.ts --action <name> [options]

Actions:
  list-notes | get-note | search-notes | create-note | update-note | append-note
  delete-note | list-folders | create-folder | rename-folder | move-note | delete-folder
  export-note | export-all-notes

Common options:
  --note_id <id>
  --title <title>
  --folder_path <account/folder/path>
  --target_folder_path <account/folder/path>
  --output_dir <directory>
  --content <plain text>
  --body_html <html>
  --query <search text>
  --limit <n>
  --confirm true|false
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const action = requiredString(args, "action");
  const noteId = optionalString(args, "note_id");
  const title = optionalString(args, "title");
  const folderPath = optionalString(args, "folder_path");
  const targetFolderPath = optionalString(args, "target_folder_path");
  const content = optionalString(args, "content");
  const bodyHtml = optionalString(args, "body_html");
  const query = optionalString(args, "query");
  const outputDir = optionalString(args, "output_dir");
  const limit = optionalNumber(args, "limit");
  const confirm = optionalBoolean(args, "confirm");

  const scriptPath = `${__skillRoot}/scripts/apple-notes.py`;
  const scriptArgs = ["--action", action];

  if (noteId) scriptArgs.push("--note-id", noteId);
  if (title) scriptArgs.push("--title", title);
  if (folderPath) scriptArgs.push("--folder-path", folderPath);
  if (targetFolderPath) scriptArgs.push("--target-folder-path", targetFolderPath);
  if (content) scriptArgs.push("--content", content);
  if (bodyHtml) scriptArgs.push("--body-html", bodyHtml);
  if (query) scriptArgs.push("--query", query);
  if (outputDir) scriptArgs.push("--output-dir", outputDir);
  if (limit !== null) scriptArgs.push("--limit", String(limit));
  if (confirm !== null) scriptArgs.push("--confirm", confirm ? "true" : "false");

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
  console.error(`Apple Notes local skill failed: ${message}`);
  process.exitCode = 1;
});
