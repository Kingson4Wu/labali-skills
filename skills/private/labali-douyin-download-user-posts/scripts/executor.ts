import { chromium } from "playwright";
import { readdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import {
  DEFAULT_CDP_PORT,
  DEFAULT_PROFILE_DIR,
  canonicalizeUserUrl,
  downloadMedia,
  ensureAbsolutePath,
  ensureChromeWithRemoteDebugging,
  cleanupNonFinalArtifacts,
  ensureDir,
  ensureOnUserProfilePage,
  ensureOnWorksTab,
  extractUserPostLinks,
  enrichPostMediaFromDetail,
  extractPostTextFromDetail,
  extractUserPosts,
  extractUserSlug,
  normalizePostFolderDate,
  normalizeTimestamp,
  waitForManualLogin,
  writePostMarkdown,
  writePostsJson,
  writeUserMarkdown,
  isLoginRequired,
  type DownloadUserDouyinInputs,
  type DownloadUserDouyinResult,
  type DouyinPost,
} from "./core";

export interface ExecutorContext {
  logger?: (message: string) => void;
  prompt?: (message: string) => Promise<void>;
}

function toTimeout(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return 180000;
  return Math.max(30000, Math.min(value, 600000));
}

function toMaxPosts(value: number | undefined): number {
  if (!value || Number.isNaN(value) || value < 0) return 0;
  return Math.floor(value);
}

function assertRequiredString(value: string | undefined, key: string): string {
  if (!value || !value.trim()) throw new Error(`Missing required input: ${key}`);
  return value.trim();
}

function sameUrlPath(a: string, b: string): boolean {
  const normalize = (value: string): string => value.split("#")[0].replace(/\/$/, "");
  return normalize(a) === normalize(b);
}

async function promptRequired(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`Missing required input in non-interactive mode: ${question}`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim();
    if (!answer) throw new Error(`Input cannot be empty: ${question}`);
    return answer;
  } finally {
    rl.close();
  }
}

async function promptWithDefault(question: string, fallback: string): Promise<string> {
  if (!process.stdin.isTTY) return fallback;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

async function readExistingPostIds(userDir: string): Promise<Set<string>> {
  try {
    const names = await readdir(`${userDir}/posts`);
    const out = new Set<string>();
    for (const name of names) {
      const m = name.match(/-(\d+)$/);
      if (m) out.add(m[1]);
    }
    return out;
  } catch {
    return new Set<string>();
  }
}

export async function execute(
  inputs: DownloadUserDouyinInputs,
  context?: ExecutorContext
): Promise<DownloadUserDouyinResult> {
  const log = context?.logger ?? ((message: string) => console.log(`[douyin-downloader] ${message}`));

  const profileDir = ensureAbsolutePath(inputs.profile_dir || DEFAULT_PROFILE_DIR);
  const cdpPort = (inputs.cdp_port || DEFAULT_CDP_PORT).trim();
  const timeoutMs = toTimeout(inputs.timeout_ms);
  const overwrite = inputs.overwrite ?? false;
  const includeVideos = inputs.include_videos ?? true;
  const collectLinksOnly = inputs.collect_links_only ?? false;
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
      userUrlInput = await promptRequired("请输入抖音用户主页链接 (--user_url): ");
    }
    const canonicalUserUrl = canonicalizeUserUrl(userUrlInput);

    const outputDirRaw = inputs.output_dir?.trim()
      ? inputs.output_dir.trim()
      : await promptWithDefault("请输入本地保存目录 (--output_dir, 默认 ~/Downloads/douyin-user): ", "~/Downloads/douyin-user");
    const outputDir = ensureAbsolutePath(assertRequiredString(outputDirRaw, "output_dir"));
    await ensureDir(outputDir);
    const fixedUserDir = inputs.fixed_user_dir?.trim() ? ensureAbsolutePath(inputs.fixed_user_dir.trim()) : "";

    const currentUrl = page.url();
    const currentIsUserPage = /\/user\//i.test(currentUrl) && !/\/user\/self/i.test(currentUrl);
    const targetIsUserPage = /\/user\//i.test(canonicalUserUrl);
    const sameAsTarget =
      !!currentUrl &&
      (() => {
        try {
          const currentParsed = new URL(currentUrl);
          const targetParsed = new URL(canonicalUserUrl);
          return currentParsed.origin === targetParsed.origin && currentParsed.pathname === targetParsed.pathname;
        } catch {
          return false;
        }
      })();
    const canReuseCurrentPage =
      !!currentUrl &&
      /douyin\.com|v\.douyin\.com/i.test(currentUrl) &&
      !/about:blank|newtab|chrome:\/\//i.test(currentUrl) &&
      !/\/user\/self/i.test(currentUrl) &&
      (sameAsTarget || (currentIsUserPage && targetIsUserPage));

    if (canReuseCurrentPage) {
      log(`reuse current page: ${currentUrl}`);
    } else {
      log(`opening user URL: ${canonicalUserUrl}`);
      await page.goto(canonicalUserUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(1500);
    }

    let currentAfterOpen = page.url();
    const directDetailMode = /\/(video|note)\/\d+/i.test(currentAfterOpen) && maxPosts === 1;
    if (!directDetailMode) {
      await ensureOnUserProfilePage(page, timeoutMs);
      await ensureOnWorksTab(page);
      currentAfterOpen = page.url();
    }

    if (await isLoginRequired(page)) {
      log("login appears required, waiting for manual login in current browser window");
      if (context?.prompt) {
        await context.prompt("Please complete Douyin login in the opened browser window.");
      } else {
        await waitForManualLogin("Login is required to access this Douyin profile.");
      }
      await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(800);
      currentAfterOpen = page.url();

      const stillNeedsOpen = !/douyin\.com|v\.douyin\.com/i.test(currentAfterOpen);
      if (stillNeedsOpen && !sameUrlPath(currentAfterOpen, canonicalUserUrl)) {
        log(`after login, open user URL once: ${canonicalUserUrl}`);
        await page.goto(canonicalUserUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
        await page.waitForTimeout(1200);
        currentAfterOpen = page.url();
      }

      if (!(/\/(video|note)\/\d+/i.test(currentAfterOpen) && maxPosts === 1)) {
        await ensureOnUserProfilePage(page, timeoutMs);
        await ensureOnWorksTab(page);
        currentAfterOpen = page.url();
      }
    }

    const resolvedUserUrl = currentAfterOpen;
    const canonicalResolvedUserUrl = canonicalizeUserUrl(resolvedUserUrl);

    const userSlug = extractUserSlug(canonicalResolvedUserUrl);
    const userDir = fixedUserDir || ensureAbsolutePath(`${outputDir}/${normalizeTimestamp()}-${userSlug}`);
    await ensureDir(userDir);
    if (!collectLinksOnly) {
      await ensureDir(`${userDir}/posts`);
    }
    const existingPostIds = fixedUserDir ? await readExistingPostIds(userDir) : new Set<string>();

    if (collectLinksOnly) {
      let links = await extractUserPostLinks(page, maxPosts, log).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!/Execution context was destroyed/i.test(message)) {
          throw error;
        }
        log("link extraction context destroyed by navigation, retry once after page stabilizes");
        await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
        await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
        await page.waitForTimeout(1000);
        return await extractUserPostLinks(page, maxPosts, log);
      });
      if (links.length === 0) {
        log("detail links=0 after first extraction, retry once on current page works tab");
        await ensureOnWorksTab(page);
        links = await extractUserPostLinks(page, maxPosts, log);
      }
      if (links.length === 0) {
        throw new Error("No detail links extracted from current page. Check login status and user URL.");
      }

      const linksJsonFile = `${userDir}/post_links.json`;
      const linksTxtFile = `${userDir}/post_links.txt`;
      await writeFile(linksJsonFile, `${JSON.stringify(links, null, 2)}\n`, "utf-8");
      await writeFile(linksTxtFile, `${links.map((item) => item.postUrl).join("\n")}\n`, "utf-8");

      const files = [linksJsonFile, linksTxtFile];
      const result: DownloadUserDouyinResult = {
        output_dir: outputDir,
        user_dir: userDir,
        user_url: userUrlInput,
        canonical_user_url: canonicalResolvedUserUrl,
        post_count: links.length,
        image_count: 0,
        video_count: 0,
        failed_count: 0,
        posts_json_file: linksJsonFile,
        user_md_file: linksTxtFile,
        failed: [],
        files,
      };
      log(`done (links only): links=${result.post_count}, output=${result.user_dir}`);
      return result;
    }

    let posts: DouyinPost[] = [];
    if (/\/(video|note)\/(\d+)/i.test(resolvedUserUrl) && maxPosts === 1) {
      const matched = resolvedUserUrl.match(/\/(video|note)\/(\d+)/i);
      const postId = matched?.[2] || "";
      const text = await page
        .evaluate(() => "")
        .catch(() => "");
      const detailText = await extractPostTextFromDetail(page).catch(() => "");
      posts = [
        {
          postId,
          postUrl: resolvedUserUrl,
          text: detailText || text,
          publishedAt: "",
          likeCount: "",
          commentCount: "",
          shareCount: "",
          imageUrls: [],
          videoUrls: [],
        },
      ];
      log("direct detail mode: use current detail page as first post");
    } else {
      posts = await extractUserPosts(page, canonicalResolvedUserUrl, maxPosts, log).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Execution context was destroyed/i.test(message)) {
        throw error;
      }
      log("timeline extraction context destroyed by navigation, retry once after page stabilizes");
      await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(1000);
      return await extractUserPosts(page, canonicalResolvedUserUrl, maxPosts, log);
      });
      if (posts.length === 0) {
        log("posts=0 after first extraction, retry once on current page works tab");
        await ensureOnWorksTab(page);
        posts = await extractUserPosts(page, canonicalResolvedUserUrl, maxPosts, log);
      }
    }
    if (posts.length === 0) {
      throw new Error("No posts extracted from current page. Check login status and user URL.");
    }
    if (existingPostIds.size > 0) {
      const before = posts.length;
      posts = posts.filter((p) => !existingPostIds.has(p.postId));
      const skipped = before - posts.length;
      if (skipped > 0) log(`skip existing posts in fixed_user_dir: ${skipped}`);
      if (posts.length === 0) {
        throw new Error("No new posts to download in fixed_user_dir.");
      }
    }

    const failed: Array<{ url: string; error: string }> = [];
    const files: string[] = [];
    let imageCount = 0;
    let videoCount = 0;
    for (let i = 0; i < posts.length; i += 1) {
      let post = posts[i];
      const useDetailTab = !directDetailMode;
      const workingPage = useDetailTab ? await browserContext.newPage() : page;
      try {
        post = await enrichPostMediaFromDetail(workingPage, post, timeoutMs, log);
        posts[i] = post;
      } catch (error) {
        log(
          `detail enrichment failed for ${post.postId || post.postUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        if (useDetailTab) {
          await workingPage.close().catch(() => undefined);
        }
      }

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
      mediaResult.savedImages.forEach((item) => files.push(item.path));
      mediaResult.savedVideos.forEach((item) => files.push(item.path));
      mediaResult.failed.forEach((item) => failed.push(item));
    }

    const postsJsonFile = await writePostsJson(userDir, posts);
    const userMdFile = await writeUserMarkdown(userDir, canonicalResolvedUserUrl, posts);
    await cleanupNonFinalArtifacts(userDir);

    const result: DownloadUserDouyinResult = {
      output_dir: outputDir,
      user_dir: userDir,
      user_url: userUrlInput,
      canonical_user_url: canonicalResolvedUserUrl,
      post_count: posts.length,
      image_count: imageCount,
      video_count: videoCount,
      failed_count: failed.length,
      posts_json_file: "",
      user_md_file: "",
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
