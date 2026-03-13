import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import type { Page } from "playwright";

const execFileAsync = promisify(execFile);

export const DEFAULT_PROFILE_DIR = resolve(homedir(), ".chrome-labali");
export const DEFAULT_CDP_PORT = "9222";

const LOGIN_HINTS = ["登录", "扫码登录", "Sign in", "Login", "手机号登录", "验证码登录"];

export interface ExportUserPostLinksInputs {
  profile_url?: string;
  output_path?: string;
  include_token?: boolean;
  include_publish_time?: boolean;
  exclude_sticky?: boolean;
  limit?: number;
  profile_dir?: string;
  cdp_port?: string;
  timeout_ms?: number;
  max_scroll_rounds?: number;
}

export interface UserPostCard {
  noteId: string;
  xsecToken?: string;
  title?: string;
  sticky: boolean;
  profileIndex: number;
}

export interface ExportUserPostLinksResult {
  profile_url: string;
  canonical_profile_url: string;
  output_file: string;
  total_links: number;
  links: string[];
  records: ExportedPostRecord[];
}

export interface ExportedPostRecord {
  note_id: string;
  url: string;
  title?: string;
  sticky: boolean;
  profile_index: number;
  publish_time?: string;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function includesAny(value: string, needles: string[]): boolean {
  const lower = value.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function parseUserId(profileUrl: string): string {
  const matched = profileUrl.match(/\/user\/profile\/([a-zA-Z0-9]+)/);
  if (!matched?.[1]) {
    throw new Error(`Unable to parse user id from profile_url: ${profileUrl}`);
  }
  return matched[1];
}

export function canonicalizeProfileUrl(profileUrl: string): string {
  const userId = parseUserId(profileUrl);
  return `https://www.xiaohongshu.com/user/profile/${userId}`;
}

export function ensureAbsolutePath(pathLike: string): string {
  return resolve(pathLike);
}

export async function ensureDir(pathLike: string): Promise<void> {
  await mkdir(pathLike, { recursive: true });
}

export async function resolveOutputFile(outputPath: string, profileUrl: string): Promise<string> {
  const abs = ensureAbsolutePath(outputPath);
  const userId = parseUserId(profileUrl);
  const exists = await stat(abs).then((s) => s).catch(() => null);

  if (exists?.isDirectory()) {
    return resolve(abs, `xhs-user-${userId}-post-links.txt`);
  }

  if (abs.endsWith("/")) {
    await ensureDir(abs);
    return resolve(abs, `xhs-user-${userId}-post-links.txt`);
  }

  const maybeDir = dirname(abs);
  await ensureDir(maybeDir);
  return abs;
}

export function buildExploreUrl(noteId: string, xsecToken?: string, includeToken = true): string {
  const base = `https://www.xiaohongshu.com/explore/${noteId}`;
  if (!includeToken || !xsecToken?.trim()) {
    return base;
  }
  const token = encodeURIComponent(xsecToken.trim());
  return `${base}?xsec_token=${token}&xsec_source=pc_user`;
}

export function dedupeLinks(links: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const link of links) {
    const clean = link.trim();
    if (!clean) {
      continue;
    }
    if (seen.has(clean)) {
      continue;
    }
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export async function writeLinksFile(
  outputFile: string,
  records: ExportedPostRecord[],
  includePublishTime: boolean
): Promise<void> {
  const body =
    records
      .map((record) =>
        includePublishTime ? `${record.publish_time || ""}\t${record.url}`.trimEnd() : record.url
      )
      .join("\n") + "\n";
  await writeFile(outputFile, body, "utf-8");
}

export async function extractPostCardsFromState(page: Page): Promise<UserPostCard[]> {
  const cards = await page.evaluate(() => {
    const state = (window as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__ as
      | {
          user?: {
            notes?: {
              _value?: unknown;
            };
          };
        }
      | undefined;

    const notesValue = state?.user?.notes?._value;
    if (!notesValue || !Array.isArray(notesValue)) {
      return [] as Array<{ noteId: string; xsecToken?: string; title?: string; sticky: boolean; profileIndex: number }>;
    }

    const out: Array<{ noteId: string; xsecToken?: string; title?: string; sticky: boolean; profileIndex: number }> = [];
    let profileIndex = 0;
    for (const bucket of notesValue) {
      if (!Array.isArray(bucket)) {
        continue;
      }
      for (const raw of bucket) {
        if (!raw || typeof raw !== "object") {
          continue;
        }
        const obj = raw as Record<string, unknown>;
        const noteCard = (obj.noteCard && typeof obj.noteCard === "object"
          ? (obj.noteCard as Record<string, unknown>)
          : null);

        const noteId =
          (typeof obj.noteId === "string" && obj.noteId) ||
          (typeof obj.id === "string" && obj.id) ||
          (noteCard && typeof noteCard.noteId === "string" ? noteCard.noteId : "");

        const xsecToken =
          (typeof obj.xsecToken === "string" && obj.xsecToken) ||
          (noteCard && typeof noteCard.xsecToken === "string" ? noteCard.xsecToken : "");

        const title =
          (noteCard && typeof noteCard.displayTitle === "string" ? noteCard.displayTitle : "") ||
          (typeof obj.displayTitle === "string" ? obj.displayTitle : "");

        const sticky =
          (noteCard &&
          noteCard.interactInfo &&
          typeof noteCard.interactInfo === "object" &&
          typeof (noteCard.interactInfo as Record<string, unknown>).sticky === "boolean"
            ? ((noteCard.interactInfo as Record<string, unknown>).sticky as boolean)
            : false) ||
          (obj.interactInfo &&
          typeof obj.interactInfo === "object" &&
          typeof (obj.interactInfo as Record<string, unknown>).sticky === "boolean"
            ? ((obj.interactInfo as Record<string, unknown>).sticky as boolean)
            : false);

        if (noteId) {
          out.push({
            noteId,
            xsecToken: xsecToken || undefined,
            title: title || undefined,
            sticky,
            profileIndex,
          });
          profileIndex += 1;
        }
      }
    }

    return out;
  });

  const seen = new Set<string>();
  const out: UserPostCard[] = [];
  for (const card of cards) {
    if (!card.noteId || seen.has(card.noteId)) {
      continue;
    }
    seen.add(card.noteId);
    out.push({
      noteId: card.noteId,
      xsecToken: card.xsecToken,
      title: card.title,
      sticky: card.sticky,
      profileIndex: card.profileIndex,
    });
  }
  return out;
}

export async function extractPublishTimeFromPostPage(page: Page, noteId: string): Promise<string | undefined> {
  const raw = await page.evaluate((targetNoteId) => {
    const state = (window as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__ as
      | {
          note?: {
            noteDetailMap?: Record<
              string,
              {
                note?: {
                  time?: string | number;
                };
                time?: string | number;
              }
            >;
          };
        }
      | undefined;

    const entry = state?.note?.noteDetailMap?.[targetNoteId];
    const value = entry?.note?.time ?? entry?.time;
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return "";
  }, noteId);

  return raw || undefined;
}

export async function scrollForNextPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollBy(0, Math.max(window.innerHeight * 0.9, 720));
  });
  await page.waitForTimeout(900);
}

export async function isLoginRequired(page: Page): Promise<boolean> {
  const pageUrl = page.url();
  if (includesAny(pageUrl, ["login", "passport", "signup"])) {
    return true;
  }
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "");
  return includesAny(bodyText, LOGIN_HINTS);
}

export async function waitForManualLogin(promptText: string): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("Login is required but current session is not interactive.");
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await rl.question(`${promptText}\nPress Enter after login is complete...`);
  } finally {
    rl.close();
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

export async function ensureChromeWithRemoteDebugging(
  port: string,
  userDataDir: string,
  log: (message: string) => void
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
  ];
  log(`Launch Chrome remote debugging session: open ${chromeArgs.join(" ")}`);
  await execFileAsync("open", chromeArgs, {
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });

  const ready = await waitForCdpEndpoint(port, 20000);
  if (!ready) {
    throw new Error(
      `Chrome CDP endpoint not ready on :${port} after launch. Start manually: open -na "Google Chrome" --args --remote-debugging-port=${port} --user-data-dir=${userDataDir}`
    );
  }
}

export async function ensureWritableTarget(outputFile: string): Promise<void> {
  const parent = dirname(outputFile);
  await ensureDir(parent);
  await access(parent, constants.W_OK).catch(() => {
    throw new Error(`Output directory is not writable: ${parent}`);
  });
}

export function validateProfileUrl(profileUrl: string): void {
  if (!isHttpUrl(profileUrl)) {
    throw new Error(`profile_url must be HTTP(S): ${profileUrl}`);
  }
  parseUserId(profileUrl);
}
