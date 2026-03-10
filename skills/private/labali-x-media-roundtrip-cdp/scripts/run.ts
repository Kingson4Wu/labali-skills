import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium, type BrowserContext, type Page } from "playwright";
import { createInterface } from "node:readline/promises";

const execFileAsync = promisify(execFile);

type ArgMap = Record<string, string | boolean>;

const X_HOME_URL = "https://x.com/home";
const X_LOGIN_URL = "https://x.com/i/flow/login";
const X_COMPOSE_URL = "https://x.com/compose/post";
const STEP_TIMEOUT_MS = 45000;
const PUBLISH_READY_TIMEOUT_MS = 120000;

function log(message: string): void {
  console.log(`[x-roundtrip] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

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

function optionalString(args: ArgMap, key: string, fallback: string): string {
  const value = args[key];
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim();
}

function printUsage(): void {
  console.log(`Usage:\n  npx tsx skills/private/labali-x-media-roundtrip-cdp/scripts/run.ts \\\n    --input_file /abs/path/media.jpg \\\n    --output_file /abs/path/processed_media.jpg \\\n    [--post_text ""] \\\n    [--cdp_port 9222] \\\n    [--profile_dir ~/.chrome-private]`);
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

async function ensureChromeWithCdp(port: string, profileDir: string): Promise<void> {
  if (await isCdpEndpointReady(port)) return;

  await execFileAsync("bash", [
    "skills/private/labali-x-media-roundtrip-cdp/scripts/launch-chrome-cdp.sh",
    port,
    profileDir,
  ]);

  const ready = await waitForCdpEndpoint(port, 20000);
  if (!ready) {
    throw new Error(
      `Chrome CDP endpoint not ready on :${port}. Start manually: open -na \"Google Chrome\" --args --remote-debugging-port=${port} --user-data-dir=${profileDir}`
    );
  }
}

function looksLikeLoginContent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("log in") ||
    lower.includes("sign in") ||
    lower.includes("phone, email, or username") ||
    lower.includes("password") ||
    lower.includes("登录") ||
    lower.includes("手机号")
  );
}

async function isLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes("/i/flow/login") || url.includes("/login") || url.includes("/signup")) {
    return true;
  }
  const text = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 5000));
  return looksLikeLoginContent(text);
}

async function waitForManualLoginIfNeeded(page: Page): Promise<void> {
  if (!(await isLoginRequired(page))) {
    log("login check: already logged in");
    return;
  }

  log("login check: not logged in, opening login flow");
  await page.goto(X_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });

  if (!process.stdin.isTTY) {
    throw new Error("Login is required but terminal is non-interactive. Please login in Chrome and rerun.");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question("Detected not logged in. Complete X login in Chrome, then press Enter to continue...");
  } finally {
    rl.close();
  }

  await page.goto(X_HOME_URL, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  if (await isLoginRequired(page)) {
    throw new Error("Login check still failed after confirmation. Ensure account is logged in this Chrome profile.");
  }
}

async function ensureXPageOpen(page: Page): Promise<void> {
  const url = page.url().toLowerCase();
  if (!url.includes("x.com")) {
    log("x page check: opening x.com/home");
    await page.goto(X_HOME_URL, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  } else {
    log("x page check: existing x.com page found, keep current page");
  }
}

async function clickFirstExisting(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.count()) {
      await target.click().catch(() => undefined);
      return true;
    }
  }
  return false;
}

async function isComposeUiReady(page: Page): Promise<boolean> {
  const hasTextarea = (await page.locator('[data-testid="tweetTextarea_0"]').count()) > 0;
  const hasFileInput = (await page.locator('input[type="file"], input[data-testid="fileInput"], [data-testid="fileInput"] input').count()) > 0;
  return hasTextarea || hasFileInput;
}

async function ensureComposeReady(page: Page): Promise<void> {
  if (await isComposeUiReady(page)) {
    log("compose check: compose UI already open, skip navigation");
    return;
  }

  const composeCandidates = [
    '[data-testid="SideNav_NewTweet_Button"]',
    '[aria-label*="Post"]',
    '[aria-label*="Tweet"]',
    '[aria-label*="发帖"]',
    '[aria-label*="推文"]',
  ];

  if (await clickFirstExisting(page, composeCandidates)) {
    await sleep(1200);
    if (await isComposeUiReady(page)) {
      log("compose check: opened compose via page button");
      return;
    }
  }

  log("compose check: compose UI not ready, opening compose page");
  await page.goto(X_COMPOSE_URL, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
  if (!(await isComposeUiReady(page))) {
    await page.waitForSelector('[data-testid="tweetTextarea_0"], input[type="file"]', { timeout: STEP_TIMEOUT_MS });
  }
}

async function resetComposeState(page: Page): Promise<void> {
  log("compose reset: attempting to close draft and retry");
  await page.keyboard.press("Escape").catch(() => undefined);

  const closeCandidates = [
    '[data-testid="app-bar-close"]',
    '[aria-label*="Close"]',
    '[aria-label*="关闭"]',
    '[aria-label*="關閉"]',
  ];
  await clickFirstExisting(page, closeCandidates);

  const discardCandidates = [
    '[data-testid="confirmationSheetConfirm"]',
    'button:has-text("Discard")',
    'button:has-text("放弃")',
    'button:has-text("丢弃")',
    'button:has-text("捨棄")',
  ];
  await clickFirstExisting(page, discardCandidates);
  await sleep(1000);
}

function extractStatusIdFromCreateTweetPayload(payload: unknown): string | null {
  const data = payload as {
    data?: {
      create_tweet?: {
        tweet_results?: {
          result?: {
            rest_id?: string;
          };
        };
      };
    };
  };

  const direct = data?.data?.create_tweet?.tweet_results?.result?.rest_id;
  if (typeof direct === "string" && /^\d+$/.test(direct)) {
    return direct;
  }

  const raw = JSON.stringify(payload);
  const matched = raw.match(/"rest_id":"(\d{10,})"/);
  return matched?.[1] ?? null;
}

function extractStatusIdFromUrl(url: string): string | null {
  const matched = url.match(/\/status\/(\d+)/);
  return matched?.[1] ?? null;
}

function publishButtonCandidates(page: Page) {
  return [
    page.locator('[data-testid="tweetButton"]').first(),
    page.locator('[data-testid="tweetButtonInline"]').first(),
  ];
}

async function isLocatorEnabled(locator: ReturnType<Page["locator"]>): Promise<boolean> {
  if ((await locator.count()) < 1) return false;
  if (!(await locator.isVisible().catch(() => false))) return false;
  const ariaDisabled = ((await locator.getAttribute("aria-disabled").catch(() => null)) ?? "").toLowerCase();
  if (ariaDisabled === "true") return false;
  const disabledProp = await locator.evaluate((el) => {
    const btn = el as HTMLButtonElement;
    return typeof btn.disabled === "boolean" ? btn.disabled : false;
  }).catch(() => false);
  return !disabledProp;
}

async function waitForEnabledPublishButton(page: Page): Promise<ReturnType<Page["locator"]> | null> {
  const deadline = Date.now() + PUBLISH_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const candidates = publishButtonCandidates(page);
    for (const candidate of candidates) {
      if (await isLocatorEnabled(candidate)) return candidate;
    }
    await sleep(500);
  }
  return null;
}

async function setInputFilesWithFallback(page: Page, inputFile: string): Promise<boolean> {
  const fileSelectors = [
    'input[type="file"]',
    'input[data-testid="fileInput"]',
    '[data-testid="fileInput"] input',
  ];

  for (const selector of fileSelectors) {
    const input = page.locator(selector).first();
    if (await input.count()) {
      await input.setInputFiles(inputFile);
      return true;
    }
  }
  return false;
}

async function publishTemporaryPost(
  page: Page,
  inputFile: string,
  postText: string
): Promise<{ statusId: string; tweetUrl: string }> {
  const postContent = postText.trim();
  log("step 1/5: prepare compose");
  await ensureComposeReady(page);

  log("step 1/5: upload media");
  const uploaded = await setInputFilesWithFallback(page, inputFile);
  if (!uploaded) {
    throw new Error("Upload input not found in current compose UI.");
  }

  if (postContent) {
    log("step 2/5: fill post text");
    const textbox = page.locator('[data-testid="tweetTextarea_0"]').first();
    await textbox.click();
    await textbox.fill(postContent);
  } else {
    log("step 2/5: skip text (media-only post)");
  }

  const publishButton = await waitForEnabledPublishButton(page);
  if (!publishButton) {
    throw new Error("Publish button not found/enabled within timeout.");
  }

  log("step 2/5: publish temporary post");
  const createTweetResponse = page
    .waitForResponse(
      (response) => response.url().includes("CreateTweet") && response.request().method() === "POST",
      { timeout: STEP_TIMEOUT_MS }
    )
    .catch(() => null);

  await publishButton.click();

  const createTweet = await createTweetResponse;
  if (createTweet) {
    const payload = await createTweet.json().catch(() => null);
    const statusId = extractStatusIdFromCreateTweetPayload(payload);
    if (statusId) {
      return { statusId, tweetUrl: `https://x.com/i/status/${statusId}` };
    }
  }

  const href = await page
    .locator('a[href*="/status/"] time')
    .first()
    .evaluate((el) => (el.closest("a") as HTMLAnchorElement | null)?.href ?? "")
    .catch(() => "");
  const statusId = extractStatusIdFromUrl(href);
  if (statusId) {
    return { statusId, tweetUrl: href };
  }

  throw new Error("Failed to resolve status id after publish.");
}

async function resolveMediaUrl(page: Page): Promise<string> {
  log("step 3/5: extract media URL from post page");

  const imageCandidates = page.locator('img[src*="pbs.twimg.com/"]').all();
  for (const image of await imageCandidates) {
    const src = (await image.getAttribute("src")) ?? "";
    if (src.includes("/media/")) return src;
  }

  const video = page.locator('video[src^="http"], source[src^="http"]').first();
  if (await video.count()) {
    const src = await video.getAttribute("src");
    if (src) return src;
  }

  const html = await page.content();
  const candidates = html.match(/https:\/\/(?:pbs|video)\.twimg\.com[^"'\s<)]+/g) ?? [];
  const picked = candidates.find((v) => v.includes("/media/")) ?? candidates.find((v) => v.includes("video.twimg.com"));
  if (picked) return picked.replace(/&amp;/g, "&");

  const statusId = extractStatusIdFromUrl(page.url());
  if (statusId) {
    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&token=x`;
    const response = await page.request.get(apiUrl, {
      timeout: STEP_TIMEOUT_MS,
      failOnStatusCode: false,
      headers: { referer: page.url() },
    });
    if (response.ok()) {
      const json = (await response.json()) as {
        mediaDetails?: Array<{ media_url_https?: string; video_info?: { variants?: Array<{ url?: string }> } }>;
      };
      const media = json.mediaDetails ?? [];
      const mediaUrl =
        media.find((m) => typeof m.media_url_https === "string" && m.media_url_https.includes("/media/"))
          ?.media_url_https ??
        media
          .flatMap((m) => m.video_info?.variants ?? [])
          .map((v) => v.url ?? "")
          .find((url) => url.startsWith("http"));
      if (mediaUrl) return mediaUrl;
    }
  }

  throw new Error("Failed to extract media URL from posted tweet.");
}

async function resolveMediaUrlWithRetry(page: Page): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < 6; i += 1) {
    try {
      return await resolveMediaUrl(page);
    } catch (error) {
      lastError = error;
      await sleep(2500);
      await page.reload({ waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS }).catch(() => undefined);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function downloadMedia(page: Page, mediaUrl: string, outputFile: string): Promise<void> {
  log("step 4/5: download media to local output");
  await mkdir(dirname(outputFile), { recursive: true });

  async function downloadHlsToFile(hlsUrl: string, target: string): Promise<void> {
    try {
      await execFileAsync("ffmpeg", ["-y", "-i", hlsUrl, "-c", "copy", target], {
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      });
      return;
    } catch {
      await execFileAsync("ffmpeg", ["-y", "-i", hlsUrl, "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-b:a", "128k", target], {
        maxBuffer: 8 * 1024 * 1024,
        env: process.env,
      });
    }
  }

  let lastError: unknown;
  for (let i = 0; i < 4; i += 1) {
    try {
      const response = await page.request.get(mediaUrl, {
        timeout: STEP_TIMEOUT_MS,
        failOnStatusCode: false,
        headers: { referer: page.url() },
      });

      if (!response.ok()) throw new Error(`HTTP ${response.status()}`);

      const contentType = (response.headers()["content-type"] ?? "").toLowerCase();
      const bytes = await response.body();
      const looksLikeHls = contentType.includes("mpegurl") || bytes.toString("utf8").startsWith("#EXTM3U");

      if (looksLikeHls) {
        log("step 4/5: detected HLS playlist, converting to media file via ffmpeg");
        await downloadHlsToFile(mediaUrl, outputFile);
      } else {
        await writeFile(outputFile, bytes);
      }
      return;
    } catch (error) {
      lastError = error;
      await sleep(1500 * (i + 1));
    }
  }

  throw new Error(`Failed to download media after retries: ${String(lastError)}`);
}

async function deleteTweet(page: Page): Promise<void> {
  log("step 5/5: delete temporary post");
  const caretButton = page.locator('[data-testid="caret"]').first();
  await caretButton.waitFor({ timeout: STEP_TIMEOUT_MS });
  await caretButton.click();

  const deleteCandidates = [
    '[role="menuitem"]:has-text("Delete")',
    '[role="menuitem"]:has-text("Delete post")',
    '[role="menuitem"]:has-text("删除")',
    '[role="menuitem"]:has-text("刪除")',
  ];

  let clickedDelete = false;
  for (const selector of deleteCandidates) {
    const item = page.locator(selector).first();
    if (await item.count()) {
      await item.click();
      clickedDelete = true;
      break;
    }
  }

  if (!clickedDelete) {
    throw new Error("Delete menu item not found in post action menu.");
  }

  const confirmDelete = page.locator('[data-testid="confirmationSheetConfirm"]').first();
  await confirmDelete.waitFor({ timeout: STEP_TIMEOUT_MS });
  await confirmDelete.click();
  await sleep(2500);
}

async function verifyTweetDeleted(page: Page, statusId: string): Promise<boolean> {
  const text = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 6000)).catch(() => "");
  const lower = text.toLowerCase();
  if (
    lower.includes("this post was deleted") ||
    lower.includes("something went wrong") ||
    lower.includes("post not found") ||
    lower.includes("this page doesn") ||
    lower.includes("该帖子不存在") ||
    lower.includes("这条帖子已删除")
  ) {
    return true;
  }

  const probe = await page.request.get(`https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&token=x`, {
    timeout: STEP_TIMEOUT_MS,
    failOnStatusCode: false,
  });
  if (!probe.ok()) return false;

  const probeJson = (await probe.json().catch(() => null)) as
    | { __typename?: string; tombstone?: { text?: { text?: string } } }
    | null;
  const tombstoneText = probeJson?.tombstone?.text?.text?.toLowerCase() ?? "";
  return Boolean(
    probeJson?.__typename?.toLowerCase().includes("tombstone") ||
      tombstoneText.includes("deleted")
  );
}

async function verifyTweetDeletedByHttp(statusId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&token=x`);
    if (!response.ok) return false;
    const json = (await response.json()) as
      | { __typename?: string; tombstone?: { text?: { text?: string } } }
      | null;
    const tombstoneText = json?.tombstone?.text?.text?.toLowerCase() ?? "";
    return Boolean(
      json?.__typename?.toLowerCase().includes("tombstone") ||
        tombstoneText.includes("deleted")
    );
  } catch {
    return false;
  }
}

function pickWorkingPage(context: BrowserContext): { page: Page; temporary: boolean } {
  const pages = context.pages();
  const xPage = pages.find((p) => p.url().includes("x.com"));
  if (xPage) return { page: xPage, temporary: false };

  const anyPage = pages[0];
  if (anyPage) return { page: anyPage, temporary: false };

  return { page: null as unknown as Page, temporary: true };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    return;
  }

  const inputFile = resolve(requiredString(args, "input_file"));
  const outputFile = resolve(requiredString(args, "output_file"));
  const postText = optionalString(args, "post_text", "");
  const cdpPort = optionalString(args, "cdp_port", "9222");
  const profileDir = optionalString(args, "profile_dir", "~/.chrome-private");

  await access(inputFile);
  log("precheck: input file readable");
  await ensureChromeWithCdp(cdpPort, profileDir);
  log("precheck: chrome cdp ready");

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  let page: Page | null = null;
  let createdTemporaryPage = false;
  try {
    log("precheck: connected over cdp");
    const context = browser.contexts()[0] ?? (await browser.newContext());

    const picked = pickWorkingPage(context);
    page = picked.temporary ? await context.newPage() : picked.page;
    createdTemporaryPage = picked.temporary;

    await ensureXPageOpen(page);
    await waitForManualLoginIfNeeded(page);

    let tweetUrl = "";
    let statusId = "";
    let mediaUrl = "";
    let postDeleted = false;

    try {
      const published = await publishTemporaryPost(page, inputFile, postText);
      tweetUrl = published.tweetUrl;
      statusId = published.statusId;

      await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS });
      mediaUrl = await resolveMediaUrlWithRetry(page);
      await downloadMedia(page, mediaUrl, outputFile);
    } finally {
      if (statusId) {
        let deleteStepError: unknown;
        try {
          if (tweetUrl) {
            await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: STEP_TIMEOUT_MS }).catch(() => undefined);
          }
          await deleteTweet(page);
        } catch (error) {
          deleteStepError = error;
        }

        try {
          postDeleted = await verifyTweetDeleted(page, statusId);
          if (!postDeleted) {
            postDeleted = await verifyTweetDeletedByHttp(statusId);
          }
        } catch {
          postDeleted = await verifyTweetDeletedByHttp(statusId);
        }

        if (!postDeleted && deleteStepError) {
          throw deleteStepError;
        }
      }
    }

    if (!postDeleted) {
      throw new Error(`Temporary post deletion verification failed for status ${statusId || "unknown"}`);
    }
    if (!mediaUrl) {
      throw new Error("Media URL resolution failed before completion.");
    }

    log("done: post deleted and media saved");
    console.log(
      JSON.stringify(
        {
          mode: "agent-browser-cdp",
          media_url: mediaUrl,
          output_file: outputFile,
          post_url: tweetUrl,
          post_deleted: postDeleted,
          status_id: statusId,
        },
        null,
        2
      )
    );

  } finally {
    if (createdTemporaryPage && page) {
      await page.close().catch(() => undefined);
      log("cleanup: closed temporary tab created for this run");
    }
    await browser.close().catch(() => undefined);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`x media roundtrip failed: ${message}`);
  process.exitCode = 1;
});
