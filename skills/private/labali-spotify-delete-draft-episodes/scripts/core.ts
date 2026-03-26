import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SPOTIFY_CREATORS_URL = "https://creators.spotify.com";
export const DEFAULT_PROFILE_DIR = resolve(homedir(), ".chrome-labali");
export const DEFAULT_CHROME_CDP_PORT = "9222";
export const DEFAULT_PROXY_MODE = "system";

export type LogFn = (message: string) => void;

export interface DeleteDraftEpisodesInputs {
  show_id: string;
  show_home_url?: string;
  show_name?: string;
  delete_all_drafts?: boolean;
  disable_deterministic_cache?: boolean;
  max_delete?: string;
  profile_dir?: string;
  headed?: boolean;
  cdp_port?: string;
  proxy_mode?: string;
  proxy_server?: string;
}

function getChromeProxyArgs(proxyModeRaw: string | undefined, proxyServerRaw: string | undefined): string[] {
  const proxyMode = (proxyModeRaw || DEFAULT_PROXY_MODE).trim().toLowerCase();
  if (proxyMode === "none") {
    return ["--no-proxy-server"];
  }
  if (proxyMode === "system") {
    return [];
  }
  if (proxyMode === "custom") {
    const proxyServer = (proxyServerRaw || "").trim();
    if (!proxyServer) {
      throw new Error("proxy_server is required when proxy_mode=custom");
    }
    return [`--proxy-server=${proxyServer}`];
  }
  throw new Error(`Unsupported proxy_mode: ${proxyMode}. Expected one of: none, system, custom`);
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
  draftFilter: ["Draft", "Draft episodes"],
  searchPlaceholder: ["Search episode titles"],
  rowAction: ["More options", "Actions", "Episode actions", "Show options menu for"],
  deleteAction: ["Delete episode", "Delete", "Remove"],
  deleteConfirm: ["Delete", "Yes, delete", "Yes, delete this episode", "Confirm"],
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
    log: LogFn,
    proxyMode?: string,
    proxyServer?: string
  ): Promise<AgentBrowserClient> {
    if (cdpPort) {
      return new AgentBrowserClient(profileDir, headed, cdpPort, log);
    }
    const resolvedCdpPort = DEFAULT_CHROME_CDP_PORT;
    await ensureChromeWithRemoteDebugging(resolvedCdpPort, profileDir, log, proxyMode, proxyServer);
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
      const tabOpened = await this.try(["tab", "new", url]);
      if (!tabOpened) {
        throw new Error(`Failed to open URL: ${url}`);
      }
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

  async clickRef(refKey: string): Promise<boolean> {
    return this.try(["click", `@${refKey}`]);
  }

  async press(key: string): Promise<boolean> {
    return this.try(["press", key]);
  }

  async evalJs(js: string): Promise<string> {
    return this.run(["eval", js], { allowFailure: true });
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

async function ensureChromeWithRemoteDebugging(
  port: string,
  userDataDir: string,
  log: LogFn,
  proxyMode?: string,
  proxyServer?: string
): Promise<void> {
  if (await isCdpEndpointReady(port)) {
    log(`Reuse Chrome remote debugging session on :${port}`);
    return;
  }

  const chromeArgs = [
    "-na",
    "Google Chrome",
    "--args",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    ...getChromeProxyArgs(proxyMode, proxyServer),
  ];
  log(`Launch Chrome remote debugging session: open ${chromeArgs.join(" ")}`);
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

export function buildShowEpisodesUrl(showId: string): string {
  return `https://creators.spotify.com/pod/show/${showId}/episodes?filter=DRAFT_EPISODES&currentPage=1`;
}

export function validateInputs(raw: DeleteDraftEpisodesInputs): asserts raw is DeleteDraftEpisodesInputs {
  if (!raw.show_id?.trim()) throw new Error("Missing required input: show_id");
  if (!/^[A-Za-z0-9]+$/.test(raw.show_id.trim())) {
    throw new Error("Invalid show_id value. Use Spotify show id characters only (A-Z, a-z, 0-9).");
  }
  if (
    raw.delete_all_drafts !== undefined &&
    raw.delete_all_drafts !== true &&
    raw.delete_all_drafts !== false
  ) {
    throw new Error("Invalid boolean input: delete_all_drafts");
  }
  if (
    raw.disable_deterministic_cache !== undefined &&
    raw.disable_deterministic_cache !== true &&
    raw.disable_deterministic_cache !== false
  ) {
    throw new Error("Invalid boolean input: disable_deterministic_cache");
  }
  if (raw.max_delete !== undefined && !/^\d+$/.test(raw.max_delete.trim())) {
    throw new Error("Invalid max_delete value. Provide a non-negative integer string.");
  }
  if (!raw.show_home_url) {
    raw.show_home_url = `https://creators.spotify.com/pod/show/${raw.show_id.trim()}/home`;
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
