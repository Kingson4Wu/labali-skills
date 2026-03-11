import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import {
  DEFAULT_CDP_PORT,
  DEFAULT_PROFILE_DIR,
  canonicalizeUserUrl,
  downloadMedia,
  ensureAbsolutePath,
  ensureChromeWithRemoteDebugging,
  ensureDir,
  extractUserPosts,
  extractUserSlug,
  isLoginRequired,
  normalizePostFolderDate,
  normalizeTimestamp,
  waitForManualLogin,
  writePostMarkdown,
  writePostsJson,
  writeUserMarkdown,
  type DownloadUserWeiboInputs,
  type DownloadUserWeiboResult,
} from "./core";

export interface ExecutorContext {
  logger?: (message: string) => void;
  prompt?: (message: string) => Promise<void>;
}

function toTimeout(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 180000;
  }
  return Math.max(30000, Math.min(value, 600000));
}

function toMaxPosts(value: number | undefined): number {
  if (!value || Number.isNaN(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function assertRequiredString(value: string | undefined, key: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required input: ${key}`);
  }
  return value.trim();
}

async function promptRequired(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`Missing required input in non-interactive mode: ${question}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
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
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

export async function execute(inputs: DownloadUserWeiboInputs, context?: ExecutorContext): Promise<DownloadUserWeiboResult> {
  const log = context?.logger ?? ((message: string) => console.log(`[weibo-downloader] ${message}`));

  const profileDir = ensureAbsolutePath(inputs.profile_dir || DEFAULT_PROFILE_DIR);
  const cdpPort = (inputs.cdp_port || DEFAULT_CDP_PORT).trim();
  const timeoutMs = toTimeout(inputs.timeout_ms);
  const overwrite = inputs.overwrite ?? false;
  const includeVideos = inputs.include_videos ?? true;
  const maxPosts = toMaxPosts(inputs.max_posts);

  await ensureDir(profileDir);
  await ensureChromeWithRemoteDebugging(cdpPort, profileDir, log);

  log(`connecting over CDP on :${cdpPort}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);

  try {
    const browserContext = browser.contexts()[0] ?? (await browser.newContext());
    const page = browserContext.pages()[0] ?? (await browserContext.newPage());

    let userUrlInput = inputs.user_url?.trim();
    if (!userUrlInput) {
      userUrlInput = await promptRequired("请输入微博用户主页链接 (--user_url): ");
    }
    const canonicalUserUrl = canonicalizeUserUrl(userUrlInput);

    const outputDirRaw = inputs.output_dir?.trim()
      ? inputs.output_dir.trim()
      : await promptWithDefault("请输入本地保存目录 (--output_dir, 默认 ./downloads/weibo-user): ", "./downloads/weibo-user");
    const outputDir = ensureAbsolutePath(assertRequiredString(outputDirRaw, "output_dir"));
    await ensureDir(outputDir);

    log(`opening user URL: ${canonicalUserUrl}`);
    await page.goto(canonicalUserUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1500);

    if (await isLoginRequired(page)) {
      log("login appears required, waiting for manual login in current browser window");
      if (context?.prompt) {
        await context.prompt("Please complete Weibo login in the opened browser window.");
      } else {
        await waitForManualLogin("Login is required to access this Weibo profile.");
      }
      await page.goto(canonicalUserUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(1500);
    }

    const userSlug = extractUserSlug(canonicalUserUrl);
    const userDir = ensureAbsolutePath(`${outputDir}/${normalizeTimestamp()}-${userSlug}`);
    await ensureDir(userDir);
    await ensureDir(`${userDir}/posts`);

    const posts = await extractUserPosts(page, canonicalUserUrl, maxPosts, log);
    if (posts.length === 0) {
      throw new Error("No posts extracted from current page. Check login status and user URL.");
    }

    const failed: Array<{ url: string; error: string }> = [];
    const files: string[] = [];
    let imageCount = 0;
    let videoCount = 0;

    for (let i = 0; i < posts.length; i += 1) {
      const post = posts[i];
      const folderName = `${normalizePostFolderDate(post.publishedAt)}-${post.postId || String(i + 1).padStart(3, "0")}`;
      const postDir = `${userDir}/posts/${folderName}`;
      const imageDir = `${postDir}/images`;
      const videoDir = `${postDir}/videos`;
      await ensureDir(postDir);

      const postMdFile = await writePostMarkdown(postDir, i + 1, post);
      files.push(postMdFile);

      const mediaResult = await downloadMedia({
        page,
        imageUrls: post.imageUrls,
        videoUrls: post.videoUrls,
        imageDir,
        videoDir,
        overwrite,
        includeVideos,
        requestTimeoutMs: timeoutMs,
      });
      imageCount += mediaResult.savedImages.length;
      videoCount += mediaResult.savedVideos.length;
      for (const item of mediaResult.savedImages) {
        files.push(item.path);
      }
      for (const item of mediaResult.savedVideos) {
        files.push(item.path);
      }
      for (const item of mediaResult.failed) {
        failed.push(item);
      }
    }

    const postsJsonFile = await writePostsJson(userDir, posts);
    const userMdFile = await writeUserMarkdown(userDir, canonicalUserUrl, posts);
    files.push(postsJsonFile, userMdFile);

    const result: DownloadUserWeiboResult = {
      output_dir: outputDir,
      user_dir: userDir,
      user_url: userUrlInput,
      canonical_user_url: canonicalUserUrl,
      post_count: posts.length,
      image_count: imageCount,
      video_count: videoCount,
      failed_count: failed.length,
      posts_json_file: postsJsonFile,
      user_md_file: userMdFile,
      failed,
      files,
    };

    log(
      `done: posts=${result.post_count}, images=${result.image_count}, videos=${result.video_count}, failed=${result.failed_count}, output=${result.user_dir}`
    );
    return result;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
