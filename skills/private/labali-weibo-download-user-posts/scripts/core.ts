import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { extname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import type { Page } from "playwright";

const execFileAsync = promisify(execFile);

export const DEFAULT_PROFILE_DIR = resolve(homedir(), ".chrome-labali-no-proxy");
export const DEFAULT_CDP_PORT = "9223";
export const DEFAULT_PROXY_MODE = "none";

const LOGIN_HINTS = ["登录", "扫码登录", "验证码登录", "Sign in", "Login"];
const IMAGE_EXT_HINTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic"];
const VIDEO_EXT_HINTS = [".mp4", ".mov", ".webm", ".m3u8"];

export interface DownloadUserWeiboInputs {
  user_url?: string;
  output_dir?: string;
  profile_dir?: string;
  cdp_port?: string;
  proxy_mode?: string;
  proxy_server?: string;
  timeout_ms?: number;
  overwrite?: boolean;
  max_posts?: number;
  include_videos?: boolean;
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

export interface DownloadFailure {
  url: string;
  error: string;
}

export interface WeiboPost {
  postId: string;
  postUrl: string;
  text: string;
  publishedAt: string;
  likeCount: string;
  commentCount: string;
  repostCount: string;
  imageUrls: string[];
  videoUrls: string[];
}

export interface DownloadUserWeiboResult {
  output_dir: string;
  user_dir: string;
  user_url: string;
  canonical_user_url: string;
  post_count: number;
  image_count: number;
  video_count: number;
  failed_count: number;
  posts_json_file: string;
  user_md_file: string;
  failed: DownloadFailure[];
  files: string[];
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const HTML_ENTITY_MAP: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  copy: "©", reg: "®", trade: "™", yen: "¥", euro: "€", pound: "£",
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[a-fA-F0-9]+|#[0-9]+|[a-zA-Z]+);/g, (_, p) => {
    if (p.startsWith("#x")) return String.fromCharCode(parseInt(p.slice(2), 16));
    if (p.startsWith("#")) return String.fromCharCode(parseInt(p.slice(1), 10));
    return HTML_ENTITY_MAP[p] ?? `&${p};`;
  });
}

function stripHtml(input: string): string {
  let current = decodeHtmlEntities(input);
  // Loop until no more tags remain, to handle overlapping cases like <scr<script>
  let prev = "";
  while (prev !== current) {
    prev = current;
    current = current
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, "");
  }
  return normalizeWhitespace(current);
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function cleanUrl(raw: string): string {
  return raw.trim().replace(/&amp;/g, "&");
}

function dedupeUrls(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = cleanUrl(raw);
    if (!isHttpUrl(url)) {
      continue;
    }
    const key = (() => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return url.split("?")[0].split("#")[0];
      }
    })();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(url);
  }
  return out;
}

function looksLikeImageUrl(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("image/")) {
    return true;
  }
  const lower = url.toLowerCase();
  return IMAGE_EXT_HINTS.some((suffix) => lower.includes(suffix));
}

function looksLikeVideoUrl(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().startsWith("video/")) {
    return true;
  }
  const lower = url.toLowerCase();
  return VIDEO_EXT_HINTS.some((suffix) => lower.includes(suffix));
}

function shouldIgnoreImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("blob:")) {
    return true;
  }
  return ["avatar", "icon", "emoji", "logo", "sprite", "favicon", "iconfont"].some((token) =>
    lower.includes(token)
  );
}

export function filterImageUrls(urls: string[]): string[] {
  return dedupeUrls(urls).filter((url) => !shouldIgnoreImage(url));
}

export function filterVideoUrls(urls: string[]): string[] {
  return dedupeUrls(urls).filter((url) => {
    const lower = url.toLowerCase();
    if (lower.startsWith("data:") || lower.startsWith("blob:")) {
      return false;
    }
    if (lower.includes("video.weibo.com/show")) {
      return false;
    }
    return (
      lower.includes("mp4") ||
      lower.includes("m3u8") ||
      lower.includes("stream") ||
      lower.includes("playback") ||
      lower.includes("vod")
    );
  });
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
  if (!trimmed) {
    throw new Error("user_url is empty");
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://weibo.com/${trimmed.replace(/^\/+/, "")}`;
  }
  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

export function extractUserSlug(userUrl: string): string {
  try {
    const parsed = new URL(userUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "weibo-user";
  } catch {
    return "weibo-user";
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
  const full = text.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
  if (full) {
    return `${full[1]}${full[2].padStart(2, "0")}${full[3].padStart(2, "0")}`;
  }
  const md = text.match(/(\d{1,2})[\-/.](\d{1,2})/);
  if (md) {
    const y = String(new Date().getFullYear());
    return `${y}${md[1].padStart(2, "0")}${md[2].padStart(2, "0")}`;
  }
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function extractUidFromUserUrl(userUrl: string): string {
  const matched = userUrl.match(/\/u\/(\d+)/);
  if (matched?.[1]) {
    return matched[1];
  }
  const pathMatched = userUrl.match(/weibo\.com\/(\d+)/i);
  if (pathMatched?.[1]) {
    return pathMatched[1];
  }
  return "";
}

export async function isLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (["signin", "login", "passport"].some((token) => url.includes(token))) {
    return true;
  }
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? "");
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
  log: (message: string) => void,
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
      `Chrome CDP endpoint not ready on :${port} after launch. Start manually: open -na "Google Chrome" --args --remote-debugging-port=${port} --user-data-dir=${userDataDir}`
    );
  }
}

export async function expandUserTimeline(page: Page, maxPosts: number): Promise<void> {
  let unchangedRounds = 0;
  let previousCount = -1;
  let endReached = false;

  for (let i = 0; i < 220; i += 1) {
    await page.evaluate(() => {
      const expanders = Array.from(document.querySelectorAll("button, a, span, div"));
      for (const item of expanders) {
        const el = item as HTMLElement;
        const text = (el.textContent || "").trim();
        if (!text || text.length > 32) {
          continue;
        }
        if (!/展开全文|全文|更多|显示全部|展开|加载更多|下一页|next|more/i.test(text)) {
          continue;
        }
        if (/评论|回复|转发|点赞|举报|收起|less/i.test(text)) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }
        if (rect.bottom < -150 || rect.top > window.innerHeight + 150) {
          continue;
        }
        el.click();
      }

      const scroller = document.scrollingElement || document.documentElement || document.body;
      scroller.scrollBy(0, Math.max(window.innerHeight * 0.9, 700));
      const inner = Array.from(document.querySelectorAll("div, section, main"))
        .filter((node) => {
          const el = node as HTMLElement;
          if (el.scrollHeight <= el.clientHeight + 120) {
            return false;
          }
          const marker = `${el.className || ""} ${el.id || ""}`;
          return /feed|list|timeline|微博|weibo/i.test(marker);
        })
        .slice(0, 6) as HTMLElement[];
      for (const el of inner) {
        el.scrollTop += Math.max(el.clientHeight * 0.9, 600);
      }
    });

    const state = await page.evaluate(() => {
      const roots = document.querySelectorAll(
        "article, [mid], [data-mid], div[class*='card-wrap'], div[class*='Feed_wrap']"
      );
      const body = document.body?.innerText || "";
      const reachedEnd = /没有更多|暂时没有更多|THE END|No more/i.test(body);
      return { count: roots.length, reachedEnd };
    });

    if (state.reachedEnd) {
      endReached = true;
    }

    if (state.count === previousCount) {
      unchangedRounds += 1;
    } else {
      unchangedRounds = 0;
      previousCount = state.count;
    }

    if (maxPosts > 0 && state.count >= maxPosts) {
      break;
    }
    if (endReached && unchangedRounds >= 3) {
      break;
    }
    if (!endReached && unchangedRounds >= 18 && i > 60) {
      break;
    }
    await page.waitForTimeout(650);
  }

  await page.evaluate(() => {
    const scroller = document.scrollingElement || document.documentElement || document.body;
    scroller.scrollTo(0, 0);
  });
}

function normalizePostId(raw: string): string {
  const cleaned = normalizeWhitespace(raw);
  if (!cleaned) {
    return "";
  }
  const stripped = cleaned.replace(/^M_/i, "");
  if (/^[a-zA-Z0-9_-]{6,}$/.test(stripped)) {
    return stripped;
  }
  return "";
}

async function fetchLongTextById(page: Page, postId: string, refererUrl: string): Promise<string> {
  if (!postId) {
    return "";
  }
  try {
    const response = await page.request.get(`https://weibo.com/ajax/statuses/longtext?id=${encodeURIComponent(postId)}`, {
      timeout: 30000,
      failOnStatusCode: false,
      headers: {
        referer: refererUrl,
        accept: "application/json, text/plain, */*",
      },
    });
    if (!response.ok()) {
      return "";
    }
    const json = (await response.json()) as { data?: { longTextContent?: string; longTextContent_raw?: string } };
    const text = json?.data?.longTextContent_raw || json?.data?.longTextContent || "";
    return stripHtml(text);
  } catch {
    return "";
  }
}

function mapApiPost(raw: Record<string, unknown>, uid: string): WeiboPost {
  const postIdRaw = raw.mblogid ?? raw.idstr ?? raw.id ?? "";
  const postId = normalizePostId(typeof postIdRaw === "string" ? postIdRaw : String(postIdRaw || ""));
  const textRaw = (raw.longTextContent_raw ?? raw.longTextContent ?? raw.text_raw ?? raw.text ?? "") as string;
  const text = stripHtml(String(textRaw || ""));
  const createdAt = normalizeWhitespace(String(raw.created_at ?? raw.createdAt ?? ""));
  const repost = String(raw.reposts_count ?? raw.repostsCount ?? "");
  const comment = String(raw.comments_count ?? raw.commentsCount ?? "");
  const like = String(raw.attitudes_count ?? raw.attitudesCount ?? "");
  const postUrl = postId ? `https://weibo.com/${uid}/${postId}` : "";

  const imageUrls: string[] = [];
  const pics = Array.isArray(raw.pics) ? raw.pics : [];
  for (const p of pics) {
    if (!p || typeof p !== "object") continue;
    const pr = p as Record<string, unknown>;
    const values = [pr.large, pr.largest, pr.mw2000, pr.bmiddle, pr.original, pr];
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      const vr = value as Record<string, unknown>;
      const url = vr.url ?? vr.geo ?? vr.src;
      if (typeof url === "string" && url) {
        imageUrls.push(url);
      }
    }
  }

  const picInfos = (raw.pic_infos && typeof raw.pic_infos === "object" ? raw.pic_infos : null) as
    | Record<string, Record<string, unknown>>
    | null;
  if (picInfos) {
    for (const value of Object.values(picInfos)) {
      const candidates = [value?.largest, value?.original, value?.mw2000, value?.bmiddle, value];
      for (const item of candidates) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const url = rec.url ?? rec.geo ?? rec.src;
        if (typeof url === "string" && url) {
          imageUrls.push(url);
        }
      }
    }
  }

  const videoUrls: string[] = [];
  function pickBestVideoUrl(mediaInfo: Record<string, unknown> | null): string {
    if (!mediaInfo) {
      return "";
    }
    const ordered = [
      mediaInfo.mp4_hd_url,
      mediaInfo.mp4_720p_mp4,
      mediaInfo.stream_url_hd,
      mediaInfo.stream_url,
      mediaInfo.mp4_sd_url,
      mediaInfo.h5_url,
    ];
    for (const value of ordered) {
      if (typeof value === "string" && value) {
        return value;
      }
    }
    const playbackList = Array.isArray(mediaInfo.playback_list) ? mediaInfo.playback_list : [];
    for (const item of playbackList) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const playInfo = (rec.play_info && typeof rec.play_info === "object" ? rec.play_info : null) as
        | Record<string, unknown>
        | null;
      const playbackUrl = playInfo?.url;
      if (typeof playbackUrl === "string" && playbackUrl) {
        return playbackUrl;
      }
    }
    return "";
  }

  const pageInfo = (raw.page_info && typeof raw.page_info === "object" ? raw.page_info : null) as
    | Record<string, unknown>
    | null;
  if (pageInfo) {
    const mediaInfo = (pageInfo.media_info && typeof pageInfo.media_info === "object" ? pageInfo.media_info : null) as
      | Record<string, unknown>
      | null;
    const picked = pickBestVideoUrl(mediaInfo);
    if (picked) {
      videoUrls.push(picked);
    }
  }

  const mixMediaInfo = (raw.mix_media_info && typeof raw.mix_media_info === "object" ? raw.mix_media_info : null) as
    | Record<string, unknown>
    | null;
  const mixItems = Array.isArray(mixMediaInfo?.items) ? (mixMediaInfo?.items as unknown[]) : [];
  for (const item of mixItems) {
    if (!item || typeof item !== "object") continue;
    const itemRec = item as Record<string, unknown>;
    const dataRec = (itemRec.data && typeof itemRec.data === "object" ? itemRec.data : null) as
      | Record<string, unknown>
      | null;
    if (!dataRec) continue;
    const objectType = String(dataRec.object_type ?? itemRec.type ?? "").toLowerCase();
    if (!objectType.includes("video")) continue;
    const mediaInfo = (dataRec.media_info && typeof dataRec.media_info === "object" ? dataRec.media_info : null) as
      | Record<string, unknown>
      | null;
    const picked = pickBestVideoUrl(mediaInfo);
    if (picked) {
      videoUrls.push(picked);
      continue;
    }
    const pageUrl = dataRec.page_url;
    if (typeof pageUrl === "string" && pageUrl) {
      videoUrls.push(pageUrl);
    }
  }

  return {
    postId,
    postUrl,
    text,
    publishedAt: createdAt,
    likeCount: like,
    commentCount: comment,
    repostCount: repost,
    imageUrls: filterImageUrls(imageUrls),
    videoUrls: filterVideoUrls(videoUrls),
  };
}

async function fetchUserPostsViaAjax(
  page: Page,
  userUrl: string,
  maxPosts: number,
  log?: (message: string) => void
): Promise<WeiboPost[]> {
  const uid = extractUidFromUserUrl(userUrl);
  if (!uid) {
    return [];
  }
  const result: WeiboPost[] = [];
  const seenIds = new Set<string>();
  const pageLimit = maxPosts > 0 ? Math.max(3, Math.ceil(maxPosts / 10) + 2) : 20;

  for (let pageNo = 1; pageNo <= pageLimit; pageNo += 1) {
    const url = `https://weibo.com/ajax/statuses/mymblog?uid=${encodeURIComponent(uid)}&page=${pageNo}&feature=0`;
    let list: Array<Record<string, unknown>> = [];
    try {
      const response = await page.request.get(url, {
        timeout: 45000,
        failOnStatusCode: false,
        headers: {
          referer: userUrl,
          accept: "application/json, text/plain, */*",
          "x-requested-with": "XMLHttpRequest",
        },
      });
      if (!response.ok()) {
        if (pageNo === 1) {
          log?.(`ajax timeline request failed: HTTP ${response.status()}`);
        }
        break;
      }
      const json = (await response.json()) as { data?: { list?: Array<Record<string, unknown>> } };
      list = Array.isArray(json?.data?.list) ? json.data.list : [];
    } catch {
      if (pageNo === 1) {
        log?.("ajax timeline request failed due to network/runtime error");
      }
      break;
    }

    if (list.length === 0) {
      break;
    }

    for (const item of list) {
      const mapped = mapApiPost(item, uid);
      if (!mapped.postId || !mapped.text) {
        continue;
      }
      if ((item.isLongText as boolean | undefined) && mapped.text.length < 120) {
        const longText = await fetchLongTextById(page, mapped.postId, userUrl);
        if (longText && longText.length > mapped.text.length) {
          mapped.text = longText;
        }
      }
      if (seenIds.has(mapped.postId)) {
        continue;
      }
      seenIds.add(mapped.postId);
      result.push(mapped);
      if (maxPosts > 0 && result.length >= maxPosts) {
        return result;
      }
    }
  }

  return result;
}

async function extractUserPostsFromDom(page: Page, maxPosts: number): Promise<WeiboPost[]> {
  await expandUserTimeline(page, maxPosts);

  const posts = await page.evaluate(() => {
    const roots = Array.from(
      document.querySelectorAll("article, [mid], [data-mid], div[class*='card-wrap'], div[class*='Feed_wrap']")
    ) as HTMLElement[];

    const out: WeiboPost[] = [];
    for (const root of roots) {
      const textSelectors = [
        "[node-type='feed_list_content_full']",
        "[node-type='feed_list_content']",
        ".detail_wbtext_4CRf9",
        ".txt",
        "[class*='detail_wbtext']",
        "[class*='content']",
      ];
      let text = "";
      for (const selector of textSelectors) {
        const candidate = root.querySelector(selector)?.textContent?.trim() || "";
        if (candidate) {
          text = candidate;
          break;
        }
      }
      if (!text) {
        text = root.textContent?.trim() || "";
      }
      if (!text || text.length < 6) {
        continue;
      }

      const postLink =
        (root.querySelector("a[href*='/status/']") as HTMLAnchorElement | null)?.href ||
        (root.querySelector("a[href*='/detail/']") as HTMLAnchorElement | null)?.href ||
        "";

      const idFromAttr =
        root.getAttribute("mid") || root.getAttribute("data-mid") || root.getAttribute("id") || "";
      const idFromLink = postLink.match(/\/(?:status|detail)\/([a-zA-Z0-9]+)/)?.[1] || "";
      const postId = idFromAttr || idFromLink;
      const normalizedId = (() => {
        const cleaned = (postId || "").trim().replace(/^M_/i, "");
        if (/^[a-zA-Z0-9_-]{6,}$/.test(cleaned)) {
          return cleaned;
        }
        return "";
      })();
      const hasValidUrl = /\/(?:status|detail)\//.test(postLink);
      if (!hasValidUrl && !normalizedId) {
        continue;
      }

      const publishedAt =
        root.querySelector("a[href*='/status/']")?.textContent?.trim() ||
        root.querySelector("[class*='from']")?.textContent?.trim() ||
        "";
      if (!publishedAt && !hasValidUrl) {
        continue;
      }

      const statsText = root.innerText || "";
      const likeCount = statsText.match(/赞\s*([0-9万wW.]+)/)?.[1] || "";
      const commentCount = statsText.match(/评论\s*([0-9万wW.]+)/)?.[1] || "";
      const repostCount = statsText.match(/转发\s*([0-9万wW.]+)/)?.[1] || "";

      const imageUrls = Array.from(root.querySelectorAll("img"))
        .map((node) => ((node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src || "").trim())
        .filter((url) => /^https?:\/\//i.test(url));

      const videoUrls = Array.from(root.querySelectorAll("video, video source"))
        .map((node) => {
          const media = node as HTMLVideoElement;
          return (media.currentSrc || media.src || media.getAttribute("src") || "").trim();
        })
        .filter((url) => /^https?:\/\//i.test(url));

      out.push({
        postId: normalizedId || postId,
        postUrl: postLink,
        text,
        publishedAt,
        likeCount,
        commentCount,
        repostCount,
        imageUrls,
        videoUrls,
      });
    }

    return out;
  });

  const byKey = new Map<string, WeiboPost>();
  for (const raw of posts) {
    const postId = normalizePostId(raw.postId || "");
    const text = normalizeWhitespace(raw.text || "");
    if (!text) {
      continue;
    }
    const key = postId || `${text.slice(0, 80)}::${normalizeWhitespace(raw.publishedAt || "")}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        postId,
        postUrl: normalizeWhitespace(raw.postUrl || ""),
        text,
        publishedAt: normalizeWhitespace(raw.publishedAt || ""),
        likeCount: normalizeWhitespace(raw.likeCount || ""),
        commentCount: normalizeWhitespace(raw.commentCount || ""),
        repostCount: normalizeWhitespace(raw.repostCount || ""),
        imageUrls: filterImageUrls(raw.imageUrls || []),
        videoUrls: filterVideoUrls(raw.videoUrls || []),
      });
      continue;
    }
    const prev = byKey.get(key)!;
    prev.imageUrls = filterImageUrls([...(prev.imageUrls || []), ...(raw.imageUrls || [])]);
    prev.videoUrls = filterVideoUrls([...(prev.videoUrls || []), ...(raw.videoUrls || [])]);
    if (!prev.postUrl && raw.postUrl) {
      prev.postUrl = raw.postUrl;
    }
  }

  const sorted = Array.from(byKey.values());
  if (maxPosts > 0 && sorted.length > maxPosts) {
    return sorted.slice(0, maxPosts);
  }
  return sorted;
}

export async function extractUserPosts(
  page: Page,
  userUrl: string,
  maxPosts: number,
  log?: (message: string) => void
): Promise<WeiboPost[]> {
  const ajaxPosts = await fetchUserPostsViaAjax(page, userUrl, maxPosts, log);
  const domPosts = await extractUserPostsFromDom(page, maxPosts);
  if (ajaxPosts.length === 0 && domPosts.length > 0) {
    log?.("using DOM extraction only because ajax timeline returned empty");
    return domPosts;
  }

  const merged = new Map<string, WeiboPost>();
  for (const post of ajaxPosts) {
    const key = post.postId || `${post.publishedAt}::${post.text.slice(0, 60)}`;
    merged.set(key, {
      ...post,
      imageUrls: filterImageUrls(post.imageUrls || []),
      videoUrls: filterVideoUrls(post.videoUrls || []),
    });
  }
  for (const post of domPosts) {
    if (!post.postId && !/\/(?:status|detail)\//.test(post.postUrl || "")) {
      continue;
    }
    const key = post.postId || `${post.publishedAt}::${post.text.slice(0, 60)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...post,
        imageUrls: filterImageUrls(post.imageUrls || []),
        videoUrls: filterVideoUrls(post.videoUrls || []),
      });
      continue;
    }
    existing.imageUrls = filterImageUrls([...(existing.imageUrls || []), ...(post.imageUrls || [])]);
    existing.videoUrls = filterVideoUrls([...(existing.videoUrls || []), ...(post.videoUrls || [])]);
    if (!existing.postUrl && post.postUrl) {
      existing.postUrl = post.postUrl;
    }
    if (post.text.length > existing.text.length) {
      existing.text = post.text;
    }
  }
  const out = Array.from(merged.values());
  if (maxPosts > 0 && out.length > maxPosts) {
    return out.slice(0, maxPosts);
  }
  return out;
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
  if (normalized.includes("video/mp4")) return ".mp4";
  if (normalized.includes("video/webm")) return ".webm";
  if (normalized.includes("quicktime")) return ".mov";
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
  overwrite: boolean,
  requestTimeoutMs: number
): Promise<{ path: string; url: string }> {
  const extFromUrl = inferExtensionFromUrl(url) || (kind === "video" ? ".mp4" : ".webp");
  const fileName = `${String(index).padStart(3, "0")}${extFromUrl}`;
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

  const response = await page.request.get(url, {
    timeout: requestTimeoutMs,
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

  const ext = inferExtensionFromContentType(contentType) || extFromUrl;
  const adjustedTarget = ext === extFromUrl ? target : resolve(outputDir, `${String(index).padStart(3, "0")}${ext}`);
  const buffer = await response.body();
  await writeFile(adjustedTarget, Buffer.from(buffer));
  return { path: adjustedTarget, url };
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
}): Promise<{ savedImages: Array<{ path: string; url: string }>; savedVideos: Array<{ path: string; url: string }>; failed: DownloadFailure[] }> {
  const savedImages: Array<{ path: string; url: string }> = [];
  const savedVideos: Array<{ path: string; url: string }> = [];
  const failed: DownloadFailure[] = [];

  const imageTargets = filterImageUrls(params.imageUrls);
  if (imageTargets.length > 0) {
    await ensureDir(params.imageDir);
  }
  let imageIndex = 1;
  for (const url of imageTargets) {
    try {
      const item = await downloadOne(
        params.page,
        url,
        params.imageDir,
        imageIndex,
        "image",
        params.overwrite,
        params.requestTimeoutMs
      );
      savedImages.push(item);
      imageIndex += 1;
    } catch (error) {
      failed.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (params.includeVideos) {
    const videoTargets = filterVideoUrls(params.videoUrls);
    if (videoTargets.length > 0) {
      await ensureDir(params.videoDir);
    }
    let videoIndex = 1;
    for (const url of videoTargets) {
      try {
        const item = await downloadOne(
          params.page,
          url,
          params.videoDir,
          videoIndex,
          "video",
          params.overwrite,
          params.requestTimeoutMs
        );
        savedVideos.push(item);
        videoIndex += 1;
      } catch (error) {
        failed.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return { savedImages, savedVideos, failed };
}

export async function writePostsJson(userDir: string, posts: WeiboPost[]): Promise<string> {
  const target = resolve(userDir, "posts.json");
  await writeFile(target, `${JSON.stringify(posts, null, 2)}\n`, "utf-8");
  return target;
}

export async function writeUserMarkdown(userDir: string, sourceUrl: string, posts: WeiboPost[]): Promise<string> {
  const lines: string[] = [
    "# Weibo User Export",
    "",
    `Source URL: ${sourceUrl}`,
    `Exported At: ${new Date().toISOString()}`,
    `Post Count: ${posts.length}`,
    "",
    "## Posts",
    "",
  ];

  let i = 1;
  for (const post of posts) {
    lines.push(`- ${i}. ${post.postId || "(no-id)"}`);
    if (post.postUrl) {
      lines.push(`  - URL: ${post.postUrl}`);
    }
    if (post.publishedAt) {
      lines.push(`  - Published At: ${post.publishedAt}`);
    }
    lines.push(`  - Repost/Comment/Like: ${post.repostCount || "0"}/${post.commentCount || "0"}/${post.likeCount || "0"}`);
    lines.push(`  - Text: ${post.text.slice(0, 240).replace(/\n/g, " ")}`);
    lines.push(`  - Media Dir: posts/${normalizePostFolderDate(post.publishedAt)}-${post.postId || "post"}`);
    i += 1;
  }

  const target = resolve(userDir, "user.md");
  await writeFile(target, `${lines.join("\n").trimEnd()}\n`, "utf-8");
  return target;
}

export async function writePostMarkdown(postDir: string, index: number, post: WeiboPost): Promise<string> {
  const lines = [
    `# Post ${index}`,
    "",
    `Post ID: ${post.postId || "unknown"}`,
    `Post URL: ${post.postUrl || ""}`,
    `Published At: ${post.publishedAt || ""}`,
    `Repost/Comment/Like: ${post.repostCount || "0"}/${post.commentCount || "0"}/${post.likeCount || "0"}`,
    "",
    "## Content",
    "",
    post.text || "(empty)",
    "",
  ];

  const target = resolve(postDir, "post.md");
  await writeFile(target, `${lines.join("\n").trimEnd()}\n`, "utf-8");
  return target;
}
