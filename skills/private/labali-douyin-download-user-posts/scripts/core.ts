import { constants } from "node:fs";
import { access, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import type { Page } from "playwright";

const execFileAsync = promisify(execFile);

export const DEFAULT_PROFILE_DIR = resolve(homedir(), ".chrome-labali");
export const DEFAULT_CDP_PORT = "9222";

const LOGIN_HINTS = ["登录", "手机号登录", "扫码登录", "Sign in", "Login"];
const IMAGE_EXT_HINTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];
const VIDEO_EXT_HINTS = [".mp4", ".mov", ".webm", ".m3u8"];

export interface DownloadUserDouyinInputs {
  user_url?: string;
  output_dir?: string;
  fixed_user_dir?: string;
  collect_links_only?: boolean;
  profile_dir?: string;
  cdp_port?: string;
  timeout_ms?: number;
  overwrite?: boolean;
  max_posts?: number;
  include_videos?: boolean;
}

export interface DownloadFailure {
  url: string;
  error: string;
}

export interface DouyinPost {
  postId: string;
  postUrl: string;
  text: string;
  publishedAt: string;
  likeCount: string;
  commentCount: string;
  shareCount: string;
  imageUrls: string[];
  videoUrls: string[];
}

export interface DownloadUserDouyinResult {
  output_dir: string;
  user_dir: string;
  user_url: string;
  canonical_user_url: string;
  post_count: number;
  image_count: number;
  video_count: number;
  failed_count: number;
  posts_json_file?: string;
  user_md_file?: string;
  failed: DownloadFailure[];
  files: string[];
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function dedupeUrls(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = raw
      .trim()
      .replace(/\\+$/g, "")
      .replace(/&amp;/g, "&");
    if (!isHttpUrl(url)) continue;
    const key = (() => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return url.split("?")[0].split("#")[0];
      }
    })();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

function looksLikeImageUrl(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("image/")) return true;
  const lower = url.toLowerCase();
  return IMAGE_EXT_HINTS.some((suffix) => lower.includes(suffix));
}

function looksLikeVideoUrl(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("video/")) return true;
  const lower = url.toLowerCase();
  if (VIDEO_EXT_HINTS.some((suffix) => lower.includes(suffix))) return true;
  return /\/play\/|video\/tos|aweme\/v\d+\/play/i.test(lower);
}

export function filterImageUrls(urls: string[]): string[] {
  return dedupeUrls(urls).filter((url) => {
    const lower = url.toLowerCase();
    if (lower.includes("avatar") || lower.includes("emoji") || lower.includes("icon") || lower.includes("logo")) {
      return false;
    }
    return (
      lower.includes("douyinpic.com") ||
      lower.includes("tos-cn") ||
      lower.includes("/obj/") ||
      lower.includes("/image/")
    );
  });
}

export function filterVideoUrls(urls: string[]): string[] {
  const cleaned = urls
    .map((x) => x.trim().replace(/\\+$/g, ""))
    .filter(Boolean);

  const candidates = dedupeUrls(cleaned).filter((url) => {
    const lower = url.toLowerCase();
    if (/(\.png|\.jpg|\.jpeg|\.webp|\.gif|\.svg|\.exe|\.dmg)(\?|$)/i.test(lower)) return false;
    if (lower.includes("tplv-obj.image") || lower.includes("aweme-client-static-resource")) return false;
    if (/\/obj\/tos-aweme-im-pc\//i.test(lower)) return false;
    return looksLikeVideoUrl(lower);
  });

  const score = (url: string): number => {
    const lower = url.toLowerCase();
    let s = 0;
    if (lower.includes(".mp4")) s += 5;
    if (/\/play\/|aweme\/v\d+\/play/i.test(lower)) s += 4;
    if (lower.includes("video/tos")) s += 3;
    if (lower.includes("mime_type=video")) s += 2;
    if (lower.includes(".m3u8")) s -= 1;
    return s;
  };

  return candidates.sort((a, b) => score(b) - score(a));
}

export function ensureAbsolutePath(pathLike: string): string {
  const expanded = pathLike.startsWith("~/") ? `${homedir()}/${pathLike.slice(2)}` : pathLike;
  return resolve(expanded);
}

export async function ensureDir(pathLike: string): Promise<void> {
  await mkdir(pathLike, { recursive: true });
}

export function canonicalizeUserUrl(userUrl: string): string {
  const trimmed = userUrl.trim();
  if (!trimmed) throw new Error("user_url is empty");
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://www.douyin.com/user/${trimmed.replace(/^\/+/, "")}`;
  }
  const parsed = new URL(trimmed);
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function extractUserSlug(userUrl: string): string {
  try {
    const parsed = new URL(userUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "douyin-user";
  } catch {
    return "douyin-user";
  }
}

export function normalizeTimestamp(): string {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

export function normalizePostFolderDate(input: string): string {
  const text = normalizeWhitespace(input);
  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) {
    const y = String(asDate.getFullYear());
    const m = String(asDate.getMonth() + 1).padStart(2, "0");
    const d = String(asDate.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

export async function isLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (["login", "passport"].some((token) => url.includes(token))) return true;

  const readBodyText = async (): Promise<string> => {
    try {
      return await page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed/i.test(message)) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => undefined);
      return await page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? "");
    }
  };

  const bodyText = await readBodyText();
  return LOGIN_HINTS.some((token) => bodyText.toLowerCase().includes(token.toLowerCase()));
}

export async function waitForManualLogin(promptText: string): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("Login is required but current session is non-interactive.");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(`${promptText}\nPress Enter after login is complete...`);
  } finally {
    rl.close();
  }
}

export async function ensureOnUserProfilePage(page: Page, timeoutMs: number): Promise<void> {
  const current = page.url();
  if (/\/user\//i.test(current)) {
    return;
  }

  if (/\/video\//i.test(current) || /v\.douyin\.com/i.test(current)) {
    const userHref = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href*='/user/']")) as HTMLAnchorElement[];
      const first = anchors.find((a) => (a.getAttribute("href") || "").includes("/user/"));
      return first?.href || first?.getAttribute("href") || "";
    });

    if (userHref) {
      const target = userHref.startsWith("http") ? userHref : `https://www.douyin.com${userHref}`;
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(1200);
    }
  }
}

export async function ensureOnWorksTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("a, button, div, span")) as HTMLElement[];
    const target = candidates.find((el) => {
      const text = (el.textContent || "").trim();
      if (!text) return false;
      if (!/作品|posts|videos/i.test(text)) return false;
      if (/评论|喜欢|收藏|私信|粉丝|关注/i.test(text)) return false;
      return true;
    });
    target?.click();
  });
  await page.waitForTimeout(1200);
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
    if (!response.ok) return false;
    const json = (await response.json()) as { Browser?: string };
    return typeof json.Browser === "string" && json.Browser.length > 0;
  } catch {
    return false;
  }
}

async function waitForCdpEndpoint(port: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpEndpointReady(port)) return true;
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

  const chromeArgs = ["-na", "Google Chrome", "--args", `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`];
  log(`Launch Chrome remote debugging session: open ${chromeArgs.join(" ")}`);
  await execFileAsync("open", chromeArgs, { maxBuffer: 4 * 1024 * 1024, env: process.env });

  const ready = await waitForCdpEndpoint(port, 20000);
  if (!ready) {
    throw new Error(
      `Chrome CDP endpoint not ready on :${port} after launch. Start manually: open -na "Google Chrome" --args --remote-debugging-port=${port} --user-data-dir=${userDataDir}`
    );
  }
}

export async function expandUserTimeline(page: Page, maxPosts: number): Promise<void> {
  let unchangedRounds = 0;
  let previousCount = -1;

  for (let i = 0; i < 280; i += 1) {
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
    });
    await page.waitForTimeout(900);

    const currentCount = await page.evaluate(() => {
      const cards = document.querySelectorAll('a[href*="/video/"], a[href*="/note/"]');
      return cards.length;
    });

    if (maxPosts > 0 && currentCount >= maxPosts) {
      break;
    }

    if (currentCount === previousCount) {
      unchangedRounds += 1;
    } else {
      unchangedRounds = 0;
      previousCount = currentCount;
    }

    if (unchangedRounds >= 12) {
      break;
    }
  }
}

export async function extractUserPostLinks(
  page: Page,
  maxPosts: number,
  log: (message: string) => void
): Promise<Array<{ postId: string; postUrl: string; postType: "video" | "note" }>> {
  const worksCount = await page
    .evaluate(() => {
      const pageText = (document.body?.innerText || "").replace(/\s+/g, "");
      const pageMatches = [
        pageText.match(/全部作品[（(]?(\d+)[)）]?/i),
        pageText.match(/作品[（(]?(\d+)[)）]?/i),
        pageText.match(/posts[（(]?(\d+)[)）]?/i),
        pageText.match(/videos[（(]?(\d+)[)）]?/i),
      ];
      for (const item of pageMatches) {
        if (!item) continue;
        const parsed = Number(item[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }

      const nodes = Array.from(document.querySelectorAll("a, button, div, span")) as HTMLElement[];
      for (const node of nodes) {
        const text = (node.textContent || "").replace(/\s+/g, "");
        if (!text) continue;
        if (!/全部作品|作品|posts|videos/i.test(text)) continue;
        const m = text.match(/(?:全部作品|作品|posts|videos)[（(]?(\d+)[)）]?/i);
        if (!m) continue;
        const parsed = Number(m[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return 0;
    })
    .catch(() => 0);
  const targetCount = worksCount > 0 ? (maxPosts > 0 ? Math.min(maxPosts, worksCount) : worksCount) : maxPosts;
  await expandUserTimeline(page, targetCount);
  const raw = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="/note/"]')) as HTMLAnchorElement[];
    return anchors.map((a) => a.getAttribute("href") || "").filter(Boolean);
  });

  const out: Array<{ postId: string; postUrl: string; postType: "video" | "note" }> = [];
  const seen = new Set<string>();
  for (const href of raw) {
    const full = href.startsWith("http") ? href : `https://www.douyin.com${href}`;
    if (/source=baiduspider/i.test(full)) continue;
    const m = full.match(/\/(video|note)\/(\d+)/i);
    if (!m) continue;
    const postType = m[1].toLowerCase() as "video" | "note";
    const postId = m[2];
    if (seen.has(postId)) continue;
    seen.add(postId);
    out.push({ postId, postType, postUrl: `https://www.douyin.com/${postType}/${postId}` });
    if (targetCount > 0 && out.length >= targetCount) break;
  }
  log(`collected detail links=${out.length}${worksCount > 0 ? ` (works_count=${worksCount})` : ""}`);
  return out;
}

function collectResponseMediaUrls(url: string, contentType?: string): { images: string[]; videos: string[] } {
  if (!isHttpUrl(url)) return { images: [], videos: [] };
  if (looksLikeImageUrl(url, contentType)) return { images: [url], videos: [] };
  if (looksLikeVideoUrl(url, contentType)) return { images: [], videos: [url] };
  return { images: [], videos: [] };
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && isHttpUrl(x));
}

function pickNestedUrls(obj: Record<string, unknown>, keys: string[]): string[] {
  let cur: unknown = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== "object" || !(key in (cur as Record<string, unknown>))) return [];
    cur = (cur as Record<string, unknown>)[key];
  }
  if (Array.isArray(cur)) return pickStringArray(cur);
  return [];
}

function collectAwemeMedia(aweme: Record<string, unknown>): { videoUrls: string[]; imageUrls: string[]; publishedAt: string; text: string } {
  const videoUrls = new Set<string>();
  const imageUrls = new Set<string>();

  const addVideo = (urls: string[]) => urls.forEach((u) => videoUrls.add(u));
  const addImage = (urls: string[]) => urls.forEach((u) => imageUrls.add(u));

  addVideo(pickNestedUrls(aweme, ["video", "play_addr", "url_list"]));
  addVideo(pickNestedUrls(aweme, ["video", "play_addr_h264", "url_list"]));
  addVideo(pickNestedUrls(aweme, ["video", "download_addr", "url_list"]));

  const bitRate = (aweme.video as Record<string, unknown> | undefined)?.bit_rate;
  if (Array.isArray(bitRate)) {
    for (const item of bitRate) {
      if (!item || typeof item !== "object") continue;
      addVideo(pickNestedUrls(item as Record<string, unknown>, ["play_addr", "url_list"]));
      addVideo(pickNestedUrls(item as Record<string, unknown>, ["play_addr_h264", "url_list"]));
    }
  }

  const images = (aweme.image_post_info as Record<string, unknown> | undefined)?.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (!image || typeof image !== "object") continue;
      addImage(pickNestedUrls(image as Record<string, unknown>, ["display_image", "url_list"]));
      addImage(pickNestedUrls(image as Record<string, unknown>, ["origin_image", "url_list"]));
      addImage(pickNestedUrls(image as Record<string, unknown>, ["url_list"]));
    }
  }

  let publishedAt = "";
  const createTime = aweme.create_time;
  if (typeof createTime === "number" && Number.isFinite(createTime) && createTime > 0) {
    const dt = new Date(createTime * 1000);
    const y = String(dt.getFullYear());
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    publishedAt = `${y}-${m}-${d} ${hh}:${mm}`;
  }

  const text = typeof aweme.desc === "string" ? aweme.desc.trim() : "";

  return {
    videoUrls: Array.from(videoUrls),
    imageUrls: Array.from(imageUrls),
    publishedAt,
    text,
  };
}

function collectTargetAwemeMedia(root: unknown, postId: string): { videoUrls: string[]; imageUrls: string[]; publishedAt: string; text: string } {
  const mergedVideos = new Set<string>();
  const mergedImages = new Set<string>();
  let publishedAt = "";
  let text = "";

  const visit = (node: unknown, depth: number): void => {
    if (depth > 12 || node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const awemeId = String(obj.aweme_id ?? "");
    if (awemeId && awemeId === postId) {
      const picked = collectAwemeMedia(obj);
      picked.videoUrls.forEach((u) => mergedVideos.add(u));
      picked.imageUrls.forEach((u) => mergedImages.add(u));
      if (!publishedAt && picked.publishedAt) publishedAt = picked.publishedAt;
      if (!text && picked.text) text = picked.text;
    }
    for (const value of Object.values(obj)) {
      visit(value, depth + 1);
    }
  };

  visit(root, 0);
  return {
    videoUrls: Array.from(mergedVideos),
    imageUrls: Array.from(mergedImages),
    publishedAt,
    text,
  };
}

async function extractTargetAwemeFromJsonResponse(
  response: { url(): string; headers(): Record<string, string>; text(): Promise<string> },
  postId: string
): Promise<{ videoUrls: string[]; imageUrls: string[]; publishedAt: string; text: string } | null> {
  const url = response.url();
  if (!/aweme|feed|post|detail|webcast|item|video/i.test(url)) return null;
  const contentType = (response.headers()["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) return null;

  const text = await response.text().catch(() => "");
  if (!text || text.length < 10 || text.length > 8_000_000) return null;
  const data = JSON.parse(text) as unknown;
  const found = collectTargetAwemeMedia(data, postId);
  if (found.videoUrls.length === 0 && found.imageUrls.length === 0 && !found.publishedAt && !found.text) return null;
  return found;
}

export async function extractUserPosts(
  page: Page,
  canonicalUserUrl: string,
  maxPosts: number,
  log: (message: string) => void
): Promise<DouyinPost[]> {
  const responseImageUrls = new Set<string>();
  const responseVideoUrls = new Set<string>();

  const responseHandler = (response: { url(): string; headers(): Record<string, string>; text(): Promise<string> }) => {
    const url = response.url();
    const headers = response.headers();
    const contentType = headers["content-type"];
    const media = collectResponseMediaUrls(url, contentType);
    media.images.forEach((item) => responseImageUrls.add(item));
    media.videos.forEach((item) => responseVideoUrls.add(item));
  };

  page.on("response", responseHandler);
  try {
    await expandUserTimeline(page, maxPosts);

    const raw = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="/note/"]')) as HTMLAnchorElement[];
      return cards.map((card) => {
        const href = card.getAttribute("href") || "";
        const text = (card.textContent || "").trim();
        const postIdMatch = href.match(/\/(?:video|note)\/(\d+)/);
        const postId = postIdMatch?.[1] || href.split("/").filter(Boolean).pop() || "";
        return {
          postId,
          postUrl: href.startsWith("http") ? href : `https://www.douyin.com${href}`,
          text,
          publishedAt: "",
          likeCount: "",
          commentCount: "",
          shareCount: "",
          imageUrls: [] as string[],
          videoUrls: [] as string[],
        };
      });
    });

    const seen = new Set<string>();
    const posts: DouyinPost[] = [];
    for (const item of raw) {
      const key = item.postId || item.postUrl;
      if (!key || seen.has(key)) continue;
      if (/source=baiduspider/i.test(item.postUrl)) continue;
      seen.add(key);

      posts.push({
        postId: item.postId,
        postUrl: item.postUrl,
        text: normalizeWhitespace(item.text),
        publishedAt: item.publishedAt,
        likeCount: item.likeCount,
        commentCount: item.commentCount,
        shareCount: item.shareCount,
        imageUrls: [],
        videoUrls: [],
      });

      if (maxPosts > 0 && posts.length >= maxPosts) break;
    }

    const imagePool = filterImageUrls(Array.from(responseImageUrls));
    const videoPool = filterVideoUrls(Array.from(responseVideoUrls));

    for (let i = 0; i < posts.length; i += 1) {
      posts[i].imageUrls = imagePool.slice(0, 8);
      posts[i].videoUrls = videoPool.slice(0, 4);
    }

    log(`extracted posts=${posts.length}, image_pool=${imagePool.length}, video_pool=${videoPool.length}`);
    return posts;
  } finally {
    page.off("response", responseHandler);
  }
}

async function collectDetailDomMedia(page: Page): Promise<{ imageUrls: string[]; videoUrls: string[]; hasVideoElement: boolean }> {
  const images = new Set<string>();
  const videos = new Set<string>();

  const addUrl = (bucket: Set<string>, value: string | null) => {
    if (!value) return;
    const v = value.trim();
    if (!v || v.startsWith("data:") || v.startsWith("blob:")) return;
    bucket.add(v);
  };

  const imgLocator = page.locator("img");
  const imgCount = await imgLocator.count();
  for (let i = 0; i < imgCount; i += 1) {
    const img = imgLocator.nth(i);
    addUrl(images, await img.getAttribute("src"));
    addUrl(images, await img.getAttribute("data-src"));
    const srcset = await img.getAttribute("srcset");
    if (srcset) {
      const first = srcset.split(",")[0]?.trim().split(" ")[0]?.trim() || "";
      addUrl(images, first || null);
    }
  }

  const videoLocator = page.locator("video");
  const videoCount = await videoLocator.count();
  const hasVideoElement = videoCount > 0;
  for (let i = 0; i < videoCount; i += 1) {
    const video = videoLocator.nth(i);
    addUrl(videos, await video.getAttribute("src"));
  }

  const sourceLocator = page.locator("source");
  const sourceCount = await sourceLocator.count();
  for (let i = 0; i < sourceCount; i += 1) {
    const source = sourceLocator.nth(i);
    addUrl(videos, await source.getAttribute("src"));
  }

  return {
    imageUrls: Array.from(images),
    videoUrls: Array.from(videos),
    hasVideoElement,
  };
}

async function extractVideoUrlsFromScripts(page: Page): Promise<string[]> {
  const scripts = await page.locator("script").allTextContents().catch(() => []);
  const found = new Set<string>();
  const push = (value: string) => {
    const cleaned = value
      .replace(/\\u002F/gi, "/")
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .trim();
    if (!isHttpUrl(cleaned)) return;
    if (!/(\.mp4\b|\/play\/|video\/tos|aweme)/i.test(cleaned)) return;
    found.add(cleaned);
  };

  for (const script of scripts) {
    const matches = script.match(/https?:\\\/\\\/[^"'\\\s]+/g) || [];
    for (const raw of matches) push(raw);
    const plain = script.match(/https?:\/\/[^"'\s]+/g) || [];
    for (const raw of plain) push(raw);
  }
  return Array.from(found);
}

function normalizeEscapedUrl(raw: string): string {
  return raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .trim();
}

async function extractNoteImageUrlsFromScripts(page: Page): Promise<string[]> {
  const scripts = await page.locator("script").allTextContents().catch(() => []);
  const bestByStem = new Map<string, string>();
  const score = (url: string): number => {
    const lower = url.toLowerCase();
    let s = 0;
    if (lower.includes("tplv-dy-aweme-images")) s += 6;
    if (lower.includes("packsourceenum_aweme_detail")) s += 5;
    if (lower.includes("biz_tag=aweme_images")) s += 4;
    if (lower.includes("q75.webp")) s += 2;
    if (lower.includes("q75.jpeg")) s += 1;
    if (lower.includes("water-v2")) s -= 4;
    if (lower.includes("~noop")) s -= 3;
    return s;
  };
  const stemOf = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.pathname.split("~")[0];
    } catch {
      return url.split("~")[0].split("?")[0];
    }
  };
  const accept = (url: string): boolean => {
    if (!isHttpUrl(url)) return false;
    const lower = url.toLowerCase();
    if (!lower.includes("douyinpic.com")) return false;
    if (!lower.includes("aweme_images") && !lower.includes("tplv-dy-aweme-images")) return false;
    if (!/\.(webp|jpeg|jpg)(\?|$)/i.test(lower)) return false;
    if (/(avatar|emoji|icon|logo)/i.test(lower)) return false;
    return true;
  };

  for (const script of scripts) {
    const escaped = script.match(/https?:\\\/\\\/[^"'\\\s]+/g) || [];
    const plain = script.match(/https?:\/\/[^"'\s]+/g) || [];
    for (const raw of [...escaped, ...plain]) {
      const url = normalizeEscapedUrl(raw);
      if (!accept(url)) continue;
      const stem = stemOf(url);
      const prev = bestByStem.get(stem);
      if (!prev || score(url) > score(prev)) bestByStem.set(stem, url);
    }
  }

  return Array.from(bestByStem.values()).sort((a, b) => score(b) - score(a));
}

async function extractTargetAwemeFromRenderData(
  page: Page,
  postId: string
): Promise<{ videoUrls: string[]; imageUrls: string[]; publishedAt: string; text: string } | null> {
  const encoded = await page.locator("#RENDER_DATA").textContent().catch(() => "");
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    const data = JSON.parse(decoded) as unknown;
    const found = collectTargetAwemeMedia(data, postId);
    if (found.videoUrls.length === 0 && found.imageUrls.length === 0 && !found.text && !found.publishedAt) {
      return null;
    }
    return found;
  } catch {
    return null;
  }
}

export async function enrichPostMediaFromDetail(
  page: Page,
  post: DouyinPost,
  timeoutMs: number,
  log: (message: string) => void
): Promise<DouyinPost> {
  const responseVideoUrls = new Set<string>();
  const responseImageUrls = new Set<string>();
  const responseJsonVideoUrls = new Set<string>();
  const responseJsonImageUrls = new Set<string>();
  let responsePublishedAt = "";
  let responsePostText = "";
  const pendingJsonParses: Array<Promise<void>> = [];

  const responseHandler = (response: { url(): string; headers(): Record<string, string> }) => {
    const url = response.url();
    const headers = response.headers();
    const contentType = headers["content-type"];
    const media = collectResponseMediaUrls(url, contentType);
    media.videos.forEach((item) => responseVideoUrls.add(item));
    media.images.forEach((item) => responseImageUrls.add(item));

    pendingJsonParses.push(
      extractTargetAwemeFromJsonResponse(response, post.postId)
        .then((picked) => {
          if (!picked) return;
          picked.videoUrls.forEach((u) => responseJsonVideoUrls.add(u));
          picked.imageUrls.forEach((u) => responseJsonImageUrls.add(u));
          if (!responsePublishedAt && picked.publishedAt) responsePublishedAt = picked.publishedAt;
          if (!responsePostText && picked.text) responsePostText = picked.text;
        })
        .catch(() => undefined)
    );
  };

  page.on("response", responseHandler);
  try {
    const current = page.url();
    const currentNormalized = current.split("#")[0].replace(/\/$/, "");
    const targetNormalized = post.postUrl.split("#")[0].replace(/\/$/, "");
    const shouldNavigate = currentNormalized !== targetNormalized;
    if (shouldNavigate) {
      log(`detail navigate: ${post.postUrl}`);
      await page.goto(post.postUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(600);
    } else {
      log(`detail reuse current page: ${post.postUrl}`);
      await page.waitForTimeout(300);
    }

    let domMedia = await collectDetailDomMedia(page);
    const isVideoDetail = /\/video\//i.test(post.postUrl);
    const isNoteDetail = /\/note\//i.test(post.postUrl);
    if (!shouldNavigate && isVideoDetail && domMedia.hasVideoElement && responseVideoUrls.size === 0 && responseJsonVideoUrls.size === 0) {
      log("detail no direct video response captured, reload once to capture target media");
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(800);
      domMedia = await collectDetailDomMedia(page);
    }
    if (!shouldNavigate && isNoteDetail && responseJsonImageUrls.size === 0 && responseImageUrls.size === 0 && domMedia.imageUrls.length === 0) {
      log("detail no note image response captured, reload once to capture note image data");
      await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(800);
      domMedia = await collectDetailDomMedia(page);
    }

    await Promise.allSettled(pendingJsonParses);
    const renderDataPicked = await extractTargetAwemeFromRenderData(page, post.postId).catch(() => null);

    const scriptVideoUrls =
      responseJsonVideoUrls.size > 0 || responseVideoUrls.size > 0 || domMedia.videoUrls.length > 0
        ? []
        : await extractVideoUrlsFromScripts(page);
    const scriptNoteImageUrls = isNoteDetail ? await extractNoteImageUrlsFromScripts(page) : [];
    const detailText = await extractPostTextFromDetail(page);
    const detailPublishedAt = await extractPostPublishedAtFromDetail(page);
    const discoveredVideoUrls = filterVideoUrls([
      ...post.videoUrls,
      ...domMedia.videoUrls,
      ...(renderDataPicked?.videoUrls || []),
      ...Array.from(responseJsonVideoUrls),
      ...Array.from(responseVideoUrls),
      ...scriptVideoUrls,
    ]);
    const discoveredImageUrls = filterImageUrls([
      ...post.imageUrls,
      ...(isNoteDetail ? [] : domMedia.imageUrls),
      ...(renderDataPicked?.imageUrls || []),
      ...Array.from(responseJsonImageUrls),
      ...Array.from(responseImageUrls),
      ...scriptNoteImageUrls,
    ]);
    const imageUrls = isNoteDetail
      ? discoveredImageUrls
      : discoveredVideoUrls.length > 0 || domMedia.hasVideoElement
        ? []
        : discoveredImageUrls;
    const videoUrls = isNoteDetail && imageUrls.length > 0 ? [] : discoveredVideoUrls;

    const merged: DouyinPost = {
      ...post,
      text: responsePostText || renderDataPicked?.text || (detailText.length > post.text.length ? detailText : post.text),
      publishedAt: responsePublishedAt || renderDataPicked?.publishedAt || detailPublishedAt || post.publishedAt,
      imageUrls,
      videoUrls,
    };

    log(`detail media post=${post.postId || post.postUrl} images=${imageUrls.length} videos=${videoUrls.length}`);
    return merged;
  } finally {
    page.off("response", responseHandler);
  }
}

export async function extractPostTextFromDetail(page: Page): Promise<string> {
  const candidates: string[] = [];
  const isNoteDetail = /\/note\//i.test(page.url());
  const stripPlatformTail = (input: string): string => {
    let out = input;
    out = out.replace(
      /\s*-\s*[^-]{0,80}?于\d{8}发布在抖音，已经收获[^。！!]*?来抖音，记录美好生活[！!]?\s*$/u,
      ""
    );
    out = out.replace(/\s*来抖音，记录美好生活[！!]?\s*$/u, "");
    return out.trim();
  };
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const v = stripPlatformTail(value.replace(/\s+/g, " ").trim());
    if (v.length < 8) return;
    if (/登录|评论|点赞|收藏|私信|分享|举报|搜索|关注/i.test(v) && v.length < 20) return;
    candidates.push(v);
  };

  add(await page.locator('meta[property="og:description"]').first().getAttribute("content").catch(() => null));
  add(await page.locator('meta[name="description"]').first().getAttribute("content").catch(() => null));

  const selectors = [
    "[data-e2e='video-desc']",
    "[data-e2e*='desc']",
    "[class*='desc']",
    "[class*='title']",
    "h1",
    "h2",
  ];
  for (const sel of selectors) {
    const texts = await page.locator(sel).allTextContents().catch(() => []);
    for (const item of texts) add(item);
  }

  const uniq = Array.from(new Set(candidates));
  if (isNoteDetail) {
    const noteLike = uniq.find((x) => /#|。|！|!/.test(x) && x.length <= 280);
    if (noteLike) return noteLike.trim();
  }
  uniq.sort((a, b) => b.length - a.length);
  return (uniq[0] || "").trim();
}

function normalizePublishedAtText(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, " ");
  const iso = compact.match(/(20\d{2})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (iso) {
    const [, y, m, d, hh, mm] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${hh.padStart(2, "0")}:${mm}`;
  }
  const zh = compact.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
  if (zh) {
    const [, y, m, d, hh, mm] = zh;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${hh.padStart(2, "0")}:${mm}`;
  }
  const ymd = compact.match(/于(20\d{2})(\d{2})(\d{2})发布/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m}-${d}`;
  }
  return "";
}

export async function extractPostPublishedAtFromDetail(page: Page): Promise<string> {
  const candidates: string[] = [];
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizePublishedAtText(value);
    if (normalized) candidates.push(normalized);
  };

  const selectors = [
    "[data-e2e*='publish']",
    "[data-e2e*='time']",
    "[class*='publish']",
    "[class*='time']",
  ];
  for (const sel of selectors) {
    const texts = await page.locator(sel).allTextContents().catch(() => []);
    for (const text of texts) add(text);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const publishLine = bodyText
    .split("\n")
    .map((x) => x.trim())
    .find((line) => /发布时间|发布于|于20\d{6}发布|20\d{2}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}|20\d{2}年\d{1,2}月\d{1,2}日\s*\d{1,2}:\d{2}/.test(line));
  add(publishLine || "");

  const scripts = await page.locator("script").allTextContents().catch(() => []);
  for (const script of scripts) {
    const timestamp = script.match(/"create_time"\s*:\s*(\d{10})/);
    if (!timestamp) continue;
    const ts = Number(timestamp[1]);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const dt = new Date(ts * 1000);
    const y = String(dt.getFullYear());
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    add(`${y}-${m}-${d} ${hh}:${mm}`);
    break;
  }

  return candidates[0] || "";
}

async function fileExists(pathLike: string): Promise<boolean> {
  try {
    await access(pathLike, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function inferExtensionFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const ext = extname(parsed.pathname).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  } catch {
    // ignore
  }
  return fallback;
}

async function downloadFile(page: Page, url: string, outputFile: string, timeoutMs: number): Promise<void> {
  const response = await page.request.get(url, { timeout: timeoutMs });
  if (!response.ok()) throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
  const buffer = await response.body();
  await writeFile(outputFile, buffer);
}

async function probeMediaKind(filePath: string): Promise<{ hasVideo: boolean; hasAudio: boolean }> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const lines = stdout
      .split("\n")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    return {
      hasVideo: lines.includes("video"),
      hasAudio: lines.includes("audio"),
    };
  } catch {
    return { hasVideo: false, hasAudio: false };
  }
}

async function consolidateFinalVideo(videoDir: string, savedVideos: Array<{ url: string; path: string }>): Promise<Array<{ url: string; path: string }>> {
  if (savedVideos.length === 0) return savedVideos;

  const enriched = await Promise.all(
    savedVideos.map(async (item) => {
      const kind = await probeMediaKind(item.path);
      const fileSize = await stat(item.path).then((s) => s.size).catch(() => 0);
      return { item, kind, fileSize };
    })
  );

  const withAv = enriched
    .filter((x) => x.kind.hasVideo && x.kind.hasAudio)
    .sort((a, b) => b.fileSize - a.fileSize);
  if (withAv.length > 0) {
    const keep = withAv[0].item;
    for (const entry of savedVideos) {
      if (entry.path !== keep.path) await unlink(entry.path).catch(() => undefined);
    }
    return [keep];
  }

  const videoOnly = enriched.filter((x) => x.kind.hasVideo && !x.kind.hasAudio).sort((a, b) => b.fileSize - a.fileSize);
  const audioOnly = enriched.filter((x) => !x.kind.hasVideo && x.kind.hasAudio).sort((a, b) => b.fileSize - a.fileSize);

  if (videoOnly.length > 0 && audioOnly.length > 0) {
    const mergedPath = `${videoDir}/001-merged.mp4`;
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        videoOnly[0].item.path,
        "-i",
        audioOnly[0].item.path,
        "-c",
        "copy",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        mergedPath,
      ]);
      for (const entry of savedVideos) {
        if (entry.path !== mergedPath) await unlink(entry.path).catch(() => undefined);
      }
      return [{ url: `${videoOnly[0].item.url} + ${audioOnly[0].item.url}`, path: mergedPath }];
    } catch {
      // fallback to largest video-only file
    }
  }

  if (videoOnly.length > 0) {
    const keep = videoOnly[0].item;
    for (const entry of savedVideos) {
      if (entry.path !== keep.path) await unlink(entry.path).catch(() => undefined);
    }
    return [keep];
  }

  // Only-audio edge case: keep the largest to avoid empty output.
  const onlyAudio = enriched.sort((a, b) => b.fileSize - a.fileSize)[0]?.item;
  if (!onlyAudio) return [];
  for (const entry of savedVideos) {
    if (entry.path !== onlyAudio.path) await unlink(entry.path).catch(() => undefined);
  }
  return [onlyAudio];
}

export async function downloadMedia(params: {
  page: Page;
  imageUrls: string[];
  videoUrls: string[];
  imageDir: string;
  videoDir: string;
  overwrite: boolean;
  includeVideos: boolean;
  requestTimeoutMs: number;
}): Promise<{
  savedImages: Array<{ url: string; path: string }>;
  savedVideos: Array<{ url: string; path: string }>;
  failed: DownloadFailure[];
}> {
  const { page, imageUrls, videoUrls, imageDir, videoDir, overwrite, includeVideos, requestTimeoutMs } = params;

  const savedImages: Array<{ url: string; path: string }> = [];
  const savedVideos: Array<{ url: string; path: string }> = [];
  const failed: DownloadFailure[] = [];
  const videoTimeoutMs = Math.max(requestTimeoutMs, 600000);

  const filteredImages = filterImageUrls(imageUrls);
  const filteredVideos = includeVideos ? filterVideoUrls(videoUrls).slice(0, 2) : [];

  if (filteredImages.length > 0) await ensureDir(imageDir);
  if (filteredVideos.length > 0) await ensureDir(videoDir);

  for (let i = 0; i < filteredImages.length; i += 1) {
    const url = filteredImages[i];
    const ext = inferExtensionFromUrl(url, ".jpg");
    const outputFile = `${imageDir}/${String(i + 1).padStart(3, "0")}${ext}`;
    try {
      if (!overwrite && (await fileExists(outputFile))) {
        savedImages.push({ url, path: outputFile });
        continue;
      }
      await downloadFile(page, url, outputFile, requestTimeoutMs);
      savedImages.push({ url, path: outputFile });
    } catch (error) {
      failed.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (let i = 0; i < filteredVideos.length; i += 1) {
    const url = filteredVideos[i];
    const ext = inferExtensionFromUrl(url, ".mp4");
    const outputFile = `${videoDir}/${String(i + 1).padStart(3, "0")}${ext}`;
    try {
      if (!overwrite && (await fileExists(outputFile))) {
        savedVideos.push({ url, path: outputFile });
        continue;
      }
      await downloadFile(page, url, outputFile, videoTimeoutMs);
      savedVideos.push({ url, path: outputFile });
    } catch (error) {
      failed.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const finalVideos = await consolidateFinalVideo(videoDir, savedVideos);
  return { savedImages, savedVideos: finalVideos, failed };
}

export async function writePostMarkdown(postDir: string, index: number, post: DouyinPost): Promise<string> {
  const file = `${postDir}/post.md`;
  const lines = [
    `# Post ${index}`,
    "",
    `- Post ID: ${post.postId}`,
    `- Post URL: ${post.postUrl}`,
    `- Published At: ${post.publishedAt || ""}`,
    `- Likes: ${post.likeCount || ""}`,
    `- Comments: ${post.commentCount || ""}`,
    `- Shares: ${post.shareCount || ""}`,
    "",
    "## Text",
    "",
    post.text || "",
    "",
  ];
  await writeFile(file, lines.join("\n"), "utf-8");
  return file;
}

export async function writePostsJson(userDir: string, posts: DouyinPost[]): Promise<string> {
  const file = `${userDir}/posts.json`;
  await writeFile(file, JSON.stringify(posts, null, 2), "utf-8");
  return file;
}

export async function writeUserMarkdown(userDir: string, canonicalUserUrl: string, posts: DouyinPost[]): Promise<string> {
  const file = `${userDir}/user.md`;
  const lines = [
    "# Douyin User Export",
    "",
    `- User URL: ${canonicalUserUrl}`,
    `- Post Count: ${posts.length}`,
    "",
  ];
  await writeFile(file, lines.join("\n"), "utf-8");
  return file;
}

export async function cleanupNonFinalArtifacts(userDir: string): Promise<void> {
  await Promise.all([unlink(`${userDir}/posts.json`).catch(() => undefined), unlink(`${userDir}/user.md`).catch(() => undefined)]);
}
