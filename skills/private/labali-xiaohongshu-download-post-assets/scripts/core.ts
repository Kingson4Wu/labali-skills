import { constants } from "node:fs";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import type { Page } from "playwright";

const execFileAsync = promisify(execFile);

export const DEFAULT_PROFILE_DIR = resolve(homedir(), ".chrome-labali");
export const DEFAULT_CDP_PORT = "9222";

const LOGIN_HINTS = ["登录", "扫码登录", "Sign in", "Login", "手机号登录", "验证码登录"];
const IMAGE_EXT_HINTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif"];
const VIDEO_EXT_HINTS = [".mp4", ".mov", ".webm", ".m3u8"];

export interface DownloadPostInputs {
  post_url?: string;
  output_dir?: string;
  profile_dir?: string;
  cdp_port?: string;
  timeout_ms?: number;
  overwrite?: boolean;
}

export interface DownloadFailure {
  url: string;
  error: string;
}

export interface DownloadPostResult {
  output_dir: string;
  note_dir: string;
  note_id: string;
  post_url: string;
  publish_time: string;
  post_md_file: string;
  image_count: number;
  video_count: number;
  failed_count: number;
  failed: DownloadFailure[];
  files: string[];
}

export interface PostSnapshot {
  title: string;
  text: string;
  publishedAt: string;
  imageUrls: string[];
  videoUrls: string[];
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function cleanUrl(raw: string): string {
  if (!raw) {
    return "";
  }
  return raw.trim().replace(/&amp;/g, "&");
}

function includesAny(value: string, needles: string[]): boolean {
  const lower = value.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function looksLikeImageUrl(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("image/")) {
    return true;
  }
  const lowerUrl = url.toLowerCase();
  return IMAGE_EXT_HINTS.some((suffix) => lowerUrl.includes(suffix));
}

function looksLikeVideoUrl(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("video/")) {
    return true;
  }
  const lowerUrl = url.toLowerCase();
  return VIDEO_EXT_HINTS.some((suffix) => lowerUrl.includes(suffix));
}

function shouldIgnoreImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("blob:")) {
    return true;
  }
  return ["avatar", "icon", "emoji", "logo", "sprite", "favicon", "/api/", "metrics_report"].some(
    (token) => lower.includes(token)
  );
}

export function parseNoteId(postUrl: string): string {
  const matched = postUrl.match(/\/(?:explore|discovery\/item|note)\/([a-zA-Z0-9]+)/);
  if (matched?.[1]) {
    return matched[1];
  }
  throw new Error(`Unable to parse note id from URL: ${postUrl}`);
}

export function canonicalizePostUrl(postUrl: string): string {
  const noteId = parseNoteId(postUrl);
  return `https://www.xiaohongshu.com/explore/${noteId}`;
}

export function normalizePublishTime(input: string): string {
  const text = input.trim();
  if (/^\d{10,13}$/.test(text)) {
    const num = Number(text);
    const ms = text.length === 13 ? num : num * 1000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      const y = String(dt.getFullYear());
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      const ss = String(dt.getSeconds()).padStart(2, "0");
      return `${y}${m}${d}-${hh}${mm}${ss}`;
    }
  }

  const fullMatch = text.match(
    /(\d{4})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})(?:[日\sT]+(\d{1,2})[:：](\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (fullMatch) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = fullMatch;
    return `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}-${hh.padStart(2, "0")}${mm.padStart(2, "0")}${ss.padStart(2, "0")}`;
  }

  const mdMatch = text.match(/(\d{1,2})[\-\/](\d{1,2})(?:\s+(\d{1,2})[:：](\d{1,2})(?::(\d{1,2}))?)?/);
  if (mdMatch) {
    const year = String(new Date().getFullYear());
    const [, m, d, hh = "00", mm = "00", ss = "00"] = mdMatch;
    return `${year}${m.padStart(2, "0")}${d.padStart(2, "0")}-${hh.padStart(2, "0")}${mm.padStart(2, "0")}${ss.padStart(2, "0")}`;
  }

  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

export function ensureAbsolutePath(pathLike: string): string {
  return resolve(pathLike);
}

export async function ensureDir(pathLike: string): Promise<void> {
  await mkdir(pathLike, { recursive: true });
}

export async function extractPostSnapshot(page: Page, noteId: string): Promise<PostSnapshot> {
  const snapshot = await page.evaluate((targetNoteId) => {
    const initialState = (window as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__ as
      | {
          note?: {
            noteDetailMap?: Record<
              string,
              {
                note?: {
                  imageList?: Array<{ urlDefault?: string; url?: string; infoList?: Array<{ url?: string }> }>;
                  video?: {
                    media?: {
                      stream?: {
                        h264?: Array<{ masterUrl?: string }>;
                        h265?: Array<{ masterUrl?: string }>;
                      };
                    };
                    masterUrl?: string;
                    playUrl?: string;
                    url?: string;
                  };
                  time?: string | number;
                  title?: string;
                  desc?: string;
                };
                imageList?: Array<{ urlDefault?: string; url?: string; infoList?: Array<{ url?: string }> }>;
                video?: {
                  media?: {
                    stream?: {
                      h264?: Array<{ masterUrl?: string }>;
                      h265?: Array<{ masterUrl?: string }>;
                    };
                  };
                  masterUrl?: string;
                  playUrl?: string;
                  url?: string;
                };
                time?: string | number;
                title?: string;
                desc?: string;
              }
            >;
          };
        }
      | undefined;
    const noteMap = initialState?.note?.noteDetailMap ?? {};
    const exact = noteMap[targetNoteId];
    const fallbackKey = Object.keys(noteMap).find((key) => key.includes(targetNoteId));
    const hit = exact ?? (fallbackKey ? noteMap[fallbackKey] : undefined);
    if (hit) {
      const note = hit.note ?? hit;
      const imageList = note.imageList ?? [];
      const urls = imageList
        .map((item) => item?.urlDefault || item?.url || item?.infoList?.[0]?.url || "")
        .filter(Boolean);
      const video = note.video;
      const videoUrls = [
        ...(video?.media?.stream?.h264 ?? []).map((item) => item?.masterUrl || ""),
        ...(video?.media?.stream?.h265 ?? []).map((item) => item?.masterUrl || ""),
        video?.masterUrl || "",
        video?.playUrl || "",
        video?.url || "",
      ].filter(Boolean);
      return {
        title: note.title || "",
        text: note.desc || "",
        publishedAt: String(note.time ?? ""),
        imageUrls: urls,
        videoUrls,
      };
    }

    let title = "";
    for (const selector of ["#detail-title", ".note-content .title", "h1"]) {
      const element = document.querySelector(selector);
      const text = element?.textContent?.trim();
      if (text) {
        title = text;
        break;
      }
    }
    if (!title) {
      title =
        (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)
          ?.getAttribute("content")
          ?.trim() || document.title || "";
    }

    const textBlocks: string[] = [];
    for (const selector of [
      "#detail-desc .note-text",
      "#detail-desc",
      ".note-content .desc",
      ".note-content",
    ]) {
      const element = document.querySelector(selector);
      const text = element?.textContent?.trim();
      if (text) {
        textBlocks.push(text);
        break;
      }
    }

    let publishedAt = "";
    for (const selector of [
      "#detail-date",
      "#detail-time",
      ".note-content .date",
      ".note-content [class*='date']",
      ".note-content [class*='time']",
      "[data-testid='publish-time']",
    ]) {
      const element = document.querySelector(selector);
      const text = element?.textContent?.trim();
      if (text) {
        publishedAt = text;
        break;
      }
    }
    if (!publishedAt) {
      const body = document.body?.innerText ?? "";
      const matched = body.match(
        /(\d{4}[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}(?:[日\sT]+\d{1,2}[:：]\d{1,2}(?::\d{1,2})?)?)/
      );
      if (matched?.[1]) {
        publishedAt = matched[1];
      }
    }

    const rootCandidates = [
      document.querySelector("#detail-container"),
      document.querySelector(".note-content"),
      document.querySelector("main"),
      document.body,
    ].filter(Boolean) as Element[];

    const imageSet = new Set<string>();
    for (const root of rootCandidates) {
      const imgs = Array.from(root.querySelectorAll("img"));
      for (const img of imgs) {
        const element = img as HTMLImageElement;
        const src = (element.currentSrc || element.src || "").trim();
        const width = element.naturalWidth || element.width || 0;
        const height = element.naturalHeight || element.height || 0;
        if (!src) {
          continue;
        }
        if (width > 200 && height > 200) {
          imageSet.add(src);
        }
      }
      if (imageSet.size >= 1) {
        break;
      }
    }

    const fallback = {
      title,
      text: textBlocks.join("\n\n").trim(),
      publishedAt,
      imageUrls: Array.from(imageSet),
      videoUrls: Array.from(document.querySelectorAll("video, video source"))
        .map((video) => {
          const element = video as HTMLVideoElement;
          return (element.currentSrc || element.src || element.getAttribute("src") || "").trim();
        })
        .filter(Boolean),
    };
    return fallback;
  }, noteId);

  return {
    title: normalizeWhitespace(snapshot.title || ""),
    text: normalizeWhitespace(snapshot.text || ""),
    publishedAt: normalizeWhitespace(snapshot.publishedAt || ""),
    imageUrls: filterPostImageUrls(snapshot.imageUrls),
    videoUrls: filterPostVideoUrls(snapshot.videoUrls || []),
  };
}

export function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = cleanUrl(raw);
    if (!isHttpUrl(url)) {
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push(url);
  }
  return out;
}

export function filterPostImageUrls(urls: string[]): string[] {
  return dedupeUrls(urls).filter((url) => {
    const lower = url.toLowerCase();
    if (shouldIgnoreImage(url)) {
      return false;
    }
    const hasImageToken =
      lower.includes("image") ||
      lower.includes("webp") ||
      lower.includes("jpg") ||
      lower.includes("jpeg") ||
      lower.includes("png") ||
      lower.includes("xhsimg") ||
      lower.includes("sns-webpic");
    return hasImageToken;
  });
}

export function filterPostVideoUrls(urls: string[]): string[] {
  return dedupeUrls(urls).filter((url) => {
    const lower = url.toLowerCase();
    if (lower.startsWith("blob:") || lower.startsWith("data:")) {
      return false;
    }
    return (
      lower.includes("video") ||
      lower.includes("sns-video") ||
      lower.includes("xhscdn") ||
      lower.includes(".mp4") ||
      lower.includes(".m3u8") ||
      lower.includes(".mov") ||
      lower.includes(".webm")
    );
  });
}

export async function isLoginRequired(page: Page, snapshot: PostSnapshot): Promise<boolean> {
  if (snapshot.text || snapshot.imageUrls.length > 0 || snapshot.videoUrls.length > 0) {
    return false;
  }
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

function inferExtensionFromContentType(contentType: string | undefined): string {
  if (!contentType) {
    return "";
  }
  const normalized = contentType.toLowerCase();
  if (normalized.includes("image/jpeg")) return ".jpg";
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/webp")) return ".webp";
  if (normalized.includes("image/gif")) return ".gif";
  if (normalized.includes("image/avif")) return ".avif";
  if (normalized.includes("video/mp4")) return ".mp4";
  if (normalized.includes("video/webm")) return ".webm";
  if (normalized.includes("quicktime")) return ".mov";
  if (normalized.includes("application/vnd.apple.mpegurl")) return ".m3u8";
  return "";
}

function inferExtensionFromUrl(url: string): string {
  const withoutQuery = url.split("?")[0];
  const ext = extname(withoutQuery).toLowerCase();
  if (ext && ext.length <= 6) {
    return ext;
  }
  return "";
}

async function downloadOne(
  page: Page,
  url: string,
  outputDir: string,
  index: number,
  kind: "image" | "video",
  overwrite: boolean
): Promise<{ path: string; url: string }> {
  const response = await page.request.get(url, {
    timeout: 60000,
    failOnStatusCode: false,
    headers: {
      referer: page.url(),
    },
  });

  if (!response.ok()) {
    throw new Error(`HTTP ${response.status()}`);
  }

  const contentType = response.headers()["content-type"];
  if (kind === "image" && !looksLikeImageUrl(url, contentType)) {
    throw new Error(`Not an image response: ${contentType || "unknown"}`);
  }
  if (kind === "video" && !looksLikeVideoUrl(url, contentType)) {
    throw new Error(`Not a video response: ${contentType || "unknown"}`);
  }

  const ext =
    inferExtensionFromContentType(contentType) ||
    inferExtensionFromUrl(url) ||
    (kind === "video" ? ".mp4" : ".webp");
  const fileName =
    kind === "video" ? `video-${String(index).padStart(3, "0")}${ext}` : `${String(index).padStart(3, "0")}${ext}`;
  const target = resolve(outputDir, fileName);

  if (!overwrite) {
    await access(target, constants.F_OK)
      .then(() => {
        throw new Error(`File already exists: ${target}`);
      })
      .catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT") {
          return;
        }
        if (error instanceof Error && error.message.startsWith("File already exists:")) {
          throw error;
        }
        throw error;
      });
  }

  const buffer = await response.body();
  await writeFile(target, Buffer.from(buffer));
  return { path: target, url };
}

export async function downloadImages(
  page: Page,
  urls: string[],
  outputDir: string,
  overwrite: boolean
): Promise<{ saved: Array<{ path: string; url: string }>; failed: DownloadFailure[] }> {
  const saved: Array<{ path: string; url: string }> = [];
  const failed: DownloadFailure[] = [];

  let index = 1;
  for (const url of filterPostImageUrls(urls)) {
    try {
      const item = await downloadOne(page, url, outputDir, index, "image", overwrite);
      saved.push(item);
      index += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ url, error: message });
    }
  }

  return { saved, failed };
}

export async function downloadVideos(
  page: Page,
  urls: string[],
  outputDir: string,
  overwrite: boolean
): Promise<{ saved: Array<{ path: string; url: string }>; failed: DownloadFailure[] }> {
  const saved: Array<{ path: string; url: string }> = [];
  const failed: DownloadFailure[] = [];

  let index = 1;
  for (const url of filterPostVideoUrls(urls)) {
    try {
      const item = await downloadOne(page, url, outputDir, index, "video", overwrite);
      saved.push(item);
      index += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ url, error: message });
    }
  }

  return { saved, failed };
}

export async function writePostMarkdown(params: {
  noteDir: string;
  sourceUrl: string;
  title: string;
  text: string;
  publishedAt: string;
}): Promise<string> {
  const content = [
    `# ${params.title || "Untitled"}`,
    "",
    `Source URL: ${params.sourceUrl}`,
    `Published At: ${params.publishedAt || "unknown"}`,
    `Exported At: ${new Date().toISOString()}`,
    "",
    "## Content",
    "",
    params.text || "(No text content extracted)",
    "",
  ].join("\n");

  const target = resolve(params.noteDir, "post.md");
  await writeFile(target, content, "utf-8");
  return target;
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

function toConcatListLine(pathValue: string): string {
  const escaped = pathValue.replace(/'/g, "'\\''");
  return `file '${escaped}'`;
}

export async function mergeVideosAndCleanup(
  noteDir: string,
  videoPaths: string[],
  log: (message: string) => void
): Promise<string[]> {
  const sorted = [...videoPaths].sort((a, b) => a.localeCompare(b));
  if (sorted.length <= 1) {
    return sorted;
  }

  if (!(await hasFfmpeg())) {
    throw new Error("ffmpeg is required for merging segmented videos but was not found in PATH.");
  }

  const concatList = resolve(noteDir, "video-concat-list.txt");
  const merged = resolve(noteDir, "video-merged.mp4");
  const listContent = sorted.map(toConcatListLine).join("\n") + "\n";
  await writeFile(concatList, listContent, "utf-8");

  const copyArgs = ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", merged];
  try {
    await execFileAsync("ffmpeg", copyArgs, {
      maxBuffer: 8 * 1024 * 1024,
    });
    log("video merge completed with ffmpeg copy mode");
  } catch {
    const reencodeArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatList,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      merged,
    ];
    await execFileAsync("ffmpeg", reencodeArgs, {
      maxBuffer: 8 * 1024 * 1024,
    });
    log("video merge completed with ffmpeg re-encode mode");
  }

  for (const pathValue of sorted) {
    await unlink(pathValue).catch(() => undefined);
  }
  await unlink(concatList).catch(() => undefined);
  await unlink(resolve(noteDir, "concat-list.txt")).catch(() => undefined);
  await unlink(resolve(noteDir, "video-concat-list.txt")).catch(() => undefined);

  return [merged];
}
