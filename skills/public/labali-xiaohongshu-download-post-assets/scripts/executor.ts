import { chromium, type Page } from "playwright";
import { createInterface } from "node:readline/promises";
import {
  DEFAULT_CDP_PORT,
  DEFAULT_PROFILE_DIR,
  canonicalizePostUrl,
  downloadImages,
  downloadVideos,
  ensureChromeWithRemoteDebugging,
  ensureAbsolutePath,
  ensureDir,
  extractPostSnapshot,
  isLoginRequired,
  mergeVideosAndCleanup,
  normalizePublishTime,
  parseNoteId,
  waitForManualLogin,
  writePostMarkdown,
  type DownloadPostInputs,
  type DownloadPostResult,
} from "./core";

export interface ExecutorContext {
  logger?: (message: string) => void;
  prompt?: (message: string) => Promise<void>;
}

const XHS_HOME_URL = "https://www.xiaohongshu.com";

function toTimeout(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 90000;
  }
  return Math.max(10000, Math.min(value, 300000));
}

function assertRequiredString(value: string | undefined, key: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required input: ${key}`);
  }
  return value.trim();
}

async function isHomeLoginRequired(page: Page): Promise<boolean> {
  const url = page.url().toLowerCase();
  if (url.includes("login") || url.includes("passport")) {
    return true;
  }
  const hintText = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) ?? "");
  const lower = hintText.toLowerCase();
  return (
    lower.includes("登录") ||
    lower.includes("扫码登录") ||
    lower.includes("手机号登录") ||
    lower.includes("login") ||
    lower.includes("sign in")
  );
}

async function promptRequired(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`Missing required input in non-interactive mode: ${question}`);
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question(question)).trim();
    if (!answer) {
      throw new Error(`Input cannot be empty: ${question}`);
    }
    return answer;
  } finally {
    rl.close();
  }
}

async function promptWithDefault(question: string, fallback: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return fallback;
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question(question)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

export async function execute(inputs: DownloadPostInputs, context?: ExecutorContext): Promise<DownloadPostResult> {
  const log = context?.logger ?? ((message: string) => console.log(`[xhs-downloader] ${message}`));

  const profileDir = ensureAbsolutePath(inputs.profile_dir || DEFAULT_PROFILE_DIR);
  const cdpPort = (inputs.cdp_port || DEFAULT_CDP_PORT).trim();
  const timeoutMs = toTimeout(inputs.timeout_ms);
  const overwrite = inputs.overwrite ?? false;
  await ensureDir(profileDir);

  await ensureChromeWithRemoteDebugging(cdpPort, profileDir, log);
  log(`connecting over CDP on :${cdpPort}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);

  try {
    const browserContext = browser.contexts()[0] ?? (await browser.newContext());
    const page = browserContext.pages()[0] ?? (await browserContext.newPage());

    log(`opening Xiaohongshu home for login warmup: ${XHS_HOME_URL}`);
    await page.goto(XHS_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1000);

    if (await isHomeLoginRequired(page)) {
      log("home page suggests login is required, waiting for manual login");
      if (context?.prompt) {
        await context.prompt("请在打开的浏览器中完成小红书登录，然后继续。");
      } else {
        await waitForManualLogin("检测到可能未登录。请先在当前浏览器窗口登录小红书。");
      }
      await page.goto(XHS_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(800);
    } else {
      log("home page login check passed, continue to target post");
    }

    let postUrlInput = inputs.post_url?.trim();
    if (!postUrlInput) {
      postUrlInput = await promptRequired("请输入小红书帖子链接 (--post_url): ");
    }
    const navigationPostUrl = postUrlInput;
    const canonicalPostUrl = canonicalizePostUrl(postUrlInput);
    const noteId = parseNoteId(canonicalPostUrl);

    const outputDirRaw = inputs.output_dir?.trim()
      ? inputs.output_dir.trim()
      : await promptWithDefault("请输入本地保存目录 (--output_dir, 默认 ./downloads/xhs): ", "./downloads/xhs");
    const outputDir = ensureAbsolutePath(assertRequiredString(outputDirRaw, "output_dir"));
    await ensureDir(outputDir);

    log(`opening post URL: ${canonicalPostUrl}`);
    await page.goto(navigationPostUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1200);

    let snapshot = await extractPostSnapshot(page, noteId);
    if (await isLoginRequired(page, snapshot)) {
      log("login appears required, waiting for manual login in current browser window");
      if (context?.prompt) {
        await context.prompt("Please complete Xiaohongshu login in the opened browser window.");
      } else {
        await waitForManualLogin("Login is required to access this post.");
      }
      await page.goto(navigationPostUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(1200);
      snapshot = await extractPostSnapshot(page, noteId);
    }

    if (snapshot.imageUrls.length === 0 && snapshot.videoUrls.length === 0) {
      throw new Error(
        `No post media found for note ${noteId}. The current page may not be the target note detail page.`
      );
    }

    const publishTime = normalizePublishTime(snapshot.publishedAt || "");
    const noteDir = ensureAbsolutePath(`${outputDir}/${publishTime}-${noteId}`);
    await ensureDir(noteDir);

    const imageResult = await downloadImages(page, snapshot.imageUrls, noteDir, overwrite);
    const videoResult = await downloadVideos(page, snapshot.videoUrls, noteDir, overwrite);
    const mergedVideoFiles = await mergeVideosAndCleanup(
      noteDir,
      videoResult.saved.map((item) => item.path),
      log
    );
    const postMdFile = await writePostMarkdown({
      noteDir,
      sourceUrl: canonicalPostUrl,
      title: snapshot.title,
      text: snapshot.text,
      publishedAt: snapshot.publishedAt,
    });
    const failed = [...imageResult.failed, ...videoResult.failed];

    const result: DownloadPostResult = {
      output_dir: outputDir,
      note_dir: noteDir,
      note_id: noteId,
      post_url: canonicalPostUrl,
      publish_time: publishTime,
      post_md_file: postMdFile,
      image_count: imageResult.saved.length,
      video_count: mergedVideoFiles.length,
      failed_count: failed.length,
      failed,
      files: [...imageResult.saved.map((item) => item.path), ...mergedVideoFiles],
    };

    log(
      `done: images=${result.image_count}, videos=${result.video_count}, failed=${result.failed_count}, output=${result.note_dir}`
    );
    return result;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
