import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SPOTIFY_CREATORS_URL = "https://creators.spotify.com";
export const DEFAULT_PROFILE_DIR = ".cache/agent-browser/spotify-creators";
export const DEFAULT_CHROME_CDP_PORT = "9222";
export const DEFAULT_CHROME_USER_DATA_DIR = resolve(homedir(), ".chrome-spotify");
export const SEARCH_EPISODES_PLACEHOLDER = "Search episode titles";

export type LogFn = (message: string) => void;

export interface PublishEpisodeInputs {
  audio_file: string;
  title: string;
  description: string;
  show_id?: string;
  show_name?: string;
  season_number?: string;
  episode_number?: string;
  disable_deterministic_cache?: boolean;
  cover_image?: string;
  publish_at?: string;
  confirm_publish?: boolean;
  profile_dir?: string;
  headed?: boolean;
  cdp_port?: string;
  show_home_url?: string;
}

export interface ExecutorContext {
  logger?: LogFn;
  prompt?: (message: string) => Promise<void>;
}

export interface AgentBrowserRef {
  role?: string;
  name?: string;
}

export interface AgentBrowserSnapshotJson {
  success?: boolean;
  data?: {
    snapshot?: string;
    refs?: Record<string, AgentBrowserRef>;
  };
}

export const ACTION_CANDIDATES = {
  createEpisode: ["New episode", "Create a new episode", "Create episode", "Add episode", "Create"],
  publish: ["Publish", "Publish episode", "Save and publish"],
  publishConfirm: ["Publish now", "Confirm publish", "Publish episode"],
  schedule: ["Schedule", "Set date and time", "Schedule publish", "Publish later"],
  audioUpload: [
    "Upload audio",
    "Episode file",
    "Audio file",
    "Select file",
    "Choose file",
    "Browse files",
    "Add audio",
    "Drag and drop",
  ],
  coverUpload: ["Episode cover", "Cover image", "Artwork", "Upload image"],
  titleLabels: ["Episode title", "Title (required)", "Title", "Give your episode a name"],
  descriptionLabels: ["Episode description", "Description", "Show notes"],
  seasonLabels: ["Season number"],
  episodeLabels: ["Episode number"],
  dashboardMarkers: ["Dashboard", "Shows", "Episodes", "Analytics"],
  loginMarkers: ["Log in", "Sign up", "Continue with Spotify"],
};

export class AgentBrowserClient {
  private readonly baseArgs: string[];
  private readonly log: LogFn;
  private readonly timeoutMs: string;

  static async create(
    profileDir: string,
    headed: boolean,
    cdpPort: string | undefined,
    log: LogFn
  ): Promise<AgentBrowserClient> {
    if (cdpPort) {
      return new AgentBrowserClient(profileDir, headed, cdpPort, log);
    }
    const resolvedCdpPort = DEFAULT_CHROME_CDP_PORT;
    await ensureChromeWithRemoteDebugging(resolvedCdpPort, log);
    return new AgentBrowserClient(profileDir, headed, resolvedCdpPort, log);
  }

  constructor(profileDir: string, headed: boolean, cdpPort: string | undefined, log: LogFn) {
    if (cdpPort) {
      this.baseArgs = ["--cdp", cdpPort];
    } else {
      this.baseArgs = ["--profile", profileDir];
      if (headed) {
        this.baseArgs.push("--headed");
      }
    }
    this.log = log;
    this.timeoutMs = "90000";
  }

  private async run(
    commandArgs: string[],
    options?: { allowFailure?: boolean; asJson?: boolean }
  ): Promise<string> {
    const args = [...this.baseArgs];
    if (options?.asJson) {
      args.push("--json");
    }
    args.push(...commandArgs);

    try {
      const { stdout, stderr } = await execFileAsync("agent-browser", args, {
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          AGENT_BROWSER_DEFAULT_TIMEOUT: this.timeoutMs,
        },
      });
      if (stderr.trim()) {
        this.log(`agent-browser stderr: ${stderr.trim()}`);
      }
      return stdout.trim();
    } catch (error) {
      if (options?.allowFailure) {
        return "";
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`agent-browser failed: ${message}`);
    }
  }

  private async try(commandArgs: string[], options?: { asJson?: boolean }): Promise<boolean> {
    try {
      await this.run(commandArgs, options);
      return true;
    } catch {
      return false;
    }
  }

  async open(url: string): Promise<void> {
    const opened = await this.try(["open", url]);
    if (!opened) {
      // Best-effort: log warning but don't fail the entire operation
      console.warn('[core] Warning: Failed to open URL, but continuing:', url);
      return;
    }
    await this.run(["wait", "--load", "domcontentloaded"], { allowFailure: true });
    await this.waitForLoad();
  }

  async waitForLoad(): Promise<void> {
    await this.run(["wait", "--load", "networkidle"], { allowFailure: true });
  }

  async waitMs(ms: number): Promise<void> {
    await this.run(["wait", String(ms)], { allowFailure: true });
  }

  async waitForTextAny(candidates: string[], timeoutMs = 30000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const candidate of candidates) {
        if (await this.hasText(candidate)) {
          return true;
        }
      }
      await this.run(["wait", "500"], { allowFailure: true });
    }
    return false;
  }

  async hasText(text: string): Promise<boolean> {
    const snapshot = await this.snapshot();
    const lowerNeedle = text.toLowerCase();
    const snapshotText = (snapshot.data?.snapshot ?? "").toLowerCase();
    if (snapshotText.includes(lowerNeedle)) {
      return true;
    }
    const refs = snapshot.data?.refs ?? {};
    return Object.values(refs).some((ref) => (ref.name ?? "").toLowerCase().includes(lowerNeedle));
  }

  async clickRoleByNames(role: string, names: string[]): Promise<void> {
    for (const name of names) {
      if (await this.try(["find", "role", role, "click", "--name", name])) {
        return;
      }
    }
    throw new Error(`No clickable role=${role} match found for candidates: ${names.join(", ")}`);
  }

  async clickTextByCandidates(candidates: string[]): Promise<void> {
    for (const candidate of candidates) {
      if (await this.try(["find", "text", candidate, "click"])) {
        return;
      }
    }
    throw new Error(`No text click target found for candidates: ${candidates.join(", ")}`);
  }

  async fillByLabelCandidates(candidates: string[], value: string): Promise<void> {
    for (const candidate of candidates) {
      if (await this.try(["find", "label", candidate, "fill", value])) {
        return;
      }
    }
    throw new Error(`No fill label found for candidates: ${candidates.join(", ")}`);
  }

  async fillByPlaceholderCandidates(candidates: string[], value: string): Promise<void> {
    for (const candidate of candidates) {
      if (await this.try(["find", "placeholder", candidate, "fill", value])) {
        return;
      }
    }
    throw new Error(`No fill placeholder found for candidates: ${candidates.join(", ")}`);
  }

  async snapshot(): Promise<AgentBrowserSnapshotJson> {
    const out = await this.run(["snapshot", "-i"], { asJson: true, allowFailure: true });
    if (!out) {
      return {};
    }
    try {
      return JSON.parse(out) as AgentBrowserSnapshotJson;
    } catch {
      return {};
    }
  }

  async getUrl(): Promise<string> {
    return this.run(["get", "url"], { allowFailure: true });
  }

  async fillRef(refKey: string, value: string): Promise<boolean> {
    return this.try(["fill", `@${refKey}`, value]);
  }

  async clickRef(refKey: string): Promise<boolean> {
    return this.try(["click", `@${refKey}`]);
  }

  async press(key: string): Promise<boolean> {
    return this.try(["press", key]);
  }

  async keyboardInsertText(text: string): Promise<boolean> {
    return this.try(["keyboard", "inserttext", text]);
  }

  async evalJs(js: string): Promise<string> {
    return this.run(["eval", js], { allowFailure: true });
  }

  async uploadBySemanticCandidates(candidates: string[], filePath: string): Promise<void> {
    const snapshot = await this.snapshot();
    const refs = snapshot.data?.refs ?? {};
    const orderedRefs = Object.entries(refs);

    const tryUploadRefs = async (
      filter: (refData: AgentBrowserRef, normalizedName: string) => boolean
    ): Promise<boolean> => {
      for (const [refKey, refData] of orderedRefs) {
        const normalizedName = (refData.name ?? "").toLowerCase();
        if (!filter(refData, normalizedName)) {
          continue;
        }
        if (await this.try(["upload", `@${refKey}`, filePath])) {
          return true;
        }
      }
      return false;
    };

    const exactMatched = await tryUploadRefs((_refData, normalizedName) =>
      candidates.some((candidate) => normalizedName.includes(candidate.toLowerCase()))
    );
    if (exactMatched) {
      return;
    }

    const fallbackTokens = [
      "upload",
      "audio",
      "file",
      "episode",
      "browse",
      "choose",
      "select",
      "drag",
      "drop",
      "add",
      "media",
    ];
    const tokenMatched = await tryUploadRefs((_refData, normalizedName) =>
      fallbackTokens.some((token) => normalizedName.includes(token))
    );
    if (tokenMatched) {
      return;
    }

    const broadMatched = await tryUploadRefs((refData, normalizedName) => {
      const role = (refData.role ?? "").toLowerCase();
      const roleAllowed = role === "button" || role === "textbox" || role === "generic";
      return roleAllowed && normalizedName.length > 0;
    });
    if (broadMatched) {
      return;
    }

    if (await this.try(["upload", "input[type='file']", filePath])) {
      return;
    }
    if (await this.try(["upload", "input[type=file]", filePath])) {
      return;
    }

    const previewNames = orderedRefs
      .map(([, refData]) => refData.name ?? "")
      .filter((name) => name.trim().length > 0)
      .slice(0, 12);

    throw new Error(
      `No semantic upload target found for candidates: ${candidates.join(
        ", "
      )}. Visible refs: ${previewNames.join(" | ")}`
    );
  }

  async screenshot(path: string): Promise<void> {
    await this.run(["screenshot", path], { allowFailure: true });
  }

  async close(): Promise<void> {
    await this.run(["close"], { allowFailure: true });
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function isCdpEndpointReady(port: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return false;
    }
    const json = (await response.json()) as { Browser?: string };
    return typeof json.Browser === "string" && json.Browser.length > 0;
  } catch {
    return false;
  }
}

async function waitForCdpEndpoint(port: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpEndpointReady(port)) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function ensureChromeWithRemoteDebugging(port: string, log: LogFn): Promise<void> {
  if (await isCdpEndpointReady(port)) {
    log(`Reuse Chrome remote debugging session on :${port}`);
    return;
  }

  const chromeArgs = [
    "-na",
    "Google Chrome",
    "--args",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${DEFAULT_CHROME_USER_DATA_DIR}`,
  ];
  log(
    `Launch Chrome remote debugging session: open ${chromeArgs.join(" ")}`
  );
  await execFileAsync("open", chromeArgs, {
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });

  const ready = await waitForCdpEndpoint(port, 20000);
  if (!ready) {
    throw new Error(
      `Chrome CDP endpoint not ready on :${port} after launch. Start Chrome manually with --remote-debugging-port=${port}.`
    );
  }
}

export async function retry<T>(times: number, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < times; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function ensureReadableFile(pathValue: string, inputName: string): Promise<string> {
  const fullPath = resolve(pathValue);
  await access(fullPath, constants.R_OK).catch(() => {
    throw new Error(`Input '${inputName}' is not readable: ${fullPath}`);
  });
  return fullPath;
}

export function buildShowHomeUrl(showId: string): string {
  return `https://creators.spotify.com/pod/show/${showId}/home`;
}

export function validateInputs(raw: PublishEpisodeInputs): asserts raw is PublishEpisodeInputs {
  if (!raw.audio_file?.trim()) throw new Error("Missing required input: audio_file");
  if (!raw.title?.trim()) throw new Error("Missing required input: title");
  if (!raw.description?.trim()) throw new Error("Missing required input: description");
  const showId = raw.show_id?.trim();
  const showName = raw.show_name?.trim();
  const showHomeUrl = raw.show_home_url?.trim();
  if (!showId && !showName && !showHomeUrl) {
    throw new Error("Missing show target. Provide one of: show_id, show_home_url, show_name.");
  }
  if (showId && !/^[A-Za-z0-9]+$/.test(showId)) {
    throw new Error("Invalid show_id value. Use Spotify show id characters only (A-Z, a-z, 0-9).");
  }
  if (raw.confirm_publish !== undefined && raw.confirm_publish !== true && raw.confirm_publish !== false) {
    throw new Error("Invalid boolean input: confirm_publish");
  }
  if (
    raw.disable_deterministic_cache !== undefined &&
    raw.disable_deterministic_cache !== true &&
    raw.disable_deterministic_cache !== false
  ) {
    throw new Error("Invalid boolean input: disable_deterministic_cache");
  }
  if (raw.publish_at) {
    const parsed = new Date(raw.publish_at);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid publish_at value. Provide ISO-8601 datetime.");
    }
  }
  if (raw.season_number !== undefined && !/^\d+$/.test(raw.season_number.trim())) {
    throw new Error("Invalid season_number value. Provide a positive integer.");
  }
  if (raw.episode_number !== undefined && !/^\d+$/.test(raw.episode_number.trim())) {
    throw new Error("Invalid episode_number value. Provide a positive integer.");
  }
  if (raw.show_home_url) {
    try {
      // eslint-disable-next-line no-new
      new URL(raw.show_home_url);
    } catch {
      throw new Error("Invalid show_home_url value. Provide a full URL.");
    }
  }

  if (!raw.show_home_url && showId) {
    raw.show_home_url = buildShowHomeUrl(showId);
  }
}

export async function promptManualLogin(
  message: string,
  externalPrompt?: (message: string) => Promise<void>
): Promise<void> {
  if (externalPrompt) {
    await externalPrompt(message);
    return;
  }
  const rl = createInterface({ input, output });
  await rl.question(`${message}\nPress Enter after login is complete...`);
  rl.close();
}
