import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import { readFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  collectCommentImageUrls,
  DEFAULT_CDP_PORT,
  DEFAULT_PROFILE_DIR,
  canonicalizePostUrl,
  downloadImages,
  downloadVideos,
  ensureChromeWithRemoteDebugging,
  ensureAbsolutePath,
  ensureDir,
  extractPostSnapshot,
  extractPostComments,
  isLoginRequired,
  mergeVideosAndCleanup,
  mediaUrlIdentity,
  normalizePublishTime,
  parseNoteId,
  sanitizeTitle,
  waitForManualLogin,
  writeCommentsJson,
  writeCommentsMarkdown,
  writePostMarkdown,
  type DownloadPostInputs,
  type DownloadPostResult,
} from "./core";

export interface ExecutorContext {
  logger?: (message: string) => void;
  prompt?: (message: string) => Promise<void>;
}

async function dedupeSavedFilesByContent(
  saved: Array<{ path: string; url: string }>
): Promise<{
  uniqueSaved: Array<{ path: string; url: string }>;
  aliasByIdentity: Record<string, string>;
}> {
  const keptByHash = new Map<string, { path: string; url: string }>();
  const aliasByIdentity: Record<string, string> = {};
  const uniqueSaved: Array<{ path: string; url: string }> = [];

  for (const item of saved) {
    const buffer = await readFile(item.path);
    const digest = createHash("sha256").update(buffer).digest("hex");
    const identity = mediaUrlIdentity(item.url);
    const existing = keptByHash.get(digest);
    if (!existing) {
      keptByHash.set(digest, item);
      uniqueSaved.push(item);
      aliasByIdentity[identity] = item.path;
      continue;
    }
    aliasByIdentity[identity] = existing.path;
    await unlink(item.path).catch(() => undefined);
  }

  return { uniqueSaved, aliasByIdentity };
}

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
  const includeComments = inputs.include_comments ?? false;
  await ensureDir(profileDir);

  await ensureChromeWithRemoteDebugging(cdpPort, profileDir, log);
  log(`connecting over CDP on :${cdpPort}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);

  try {
    const browserContext = browser.contexts()[0] ?? (await browser.newContext());
    const existingPages = browserContext.pages();
    const xhsPage = existingPages.find((p) => p.url().includes("xiaohongshu.com"));
    if (xhsPage) {
      log(`reuse existing Xiaohongshu tab: ${xhsPage.url()}`);
    } else {
      log(`no existing Xiaohongshu tab found, opening new tab`);
    }
    const page = xhsPage ?? (await browserContext.newPage());

    let postUrlInput = inputs.post_url?.trim();
    if (!postUrlInput) {
      postUrlInput = await promptRequired("请输入小红书帖子链接 (--post_url): ");
    }

    // Resolve xhslink.com short URLs by navigating and capturing the redirect destination
    if (/^https?:\/\/xhslink\.com\//i.test(postUrlInput)) {
      log(`resolving xhslink short URL: ${postUrlInput}`);
      await page.goto(postUrlInput, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForTimeout(500);
      postUrlInput = page.url();
      log(`resolved to: ${postUrlInput}`);
    }

    const navigationPostUrl = postUrlInput;
    const canonicalPostUrl = canonicalizePostUrl(postUrlInput);
    const noteId = parseNoteId(canonicalPostUrl);

    const outputDirRaw = inputs.output_dir?.trim()
      ? inputs.output_dir.trim()
      : await promptWithDefault("请输入本地保存目录 (--output_dir, 默认 ~/Downloads/xhs): ", "~/Downloads/xhs");
    const outputDir = ensureAbsolutePath(assertRequiredString(outputDirRaw, "output_dir"));
    await ensureDir(outputDir);

    log(`opening post URL: ${navigationPostUrl}`);
    await page.goto(navigationPostUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1200);

    const currentUrlAfterNav = page.url();
    if (!currentUrlAfterNav.includes(noteId)) {
      throw new Error(
        `Page redirected away from target note. Expected URL to contain note ID "${noteId}", but current URL is: ${currentUrlAfterNav}`
      );
    }

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
      const currentUrlAfterLogin = page.url();
      if (!currentUrlAfterLogin.includes(noteId)) {
        throw new Error(
          `After login, page redirected away from target note. Expected URL to contain note ID "${noteId}", but current URL is: ${currentUrlAfterLogin}`
        );
      }
      snapshot = await extractPostSnapshot(page, noteId);
    }

    if (snapshot.imageUrls.length === 0 && snapshot.videoUrls.length === 0) {
      throw new Error(
        `No post media found for note ${noteId}. The current page may not be the target note detail page.`
      );
    }

    const publishTime = normalizePublishTime(snapshot.publishedAt || "");
    const today = new Date();
    const downloadDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const sanitized = sanitizeTitle(snapshot.title || "");
    const folderName = sanitized
      ? `${downloadDate}-${sanitized}-${noteId}`
      : `${downloadDate}-${noteId}`;
    const noteDir = ensureAbsolutePath(`${outputDir}/${folderName}`);
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
    let commentsJsonFile: string | undefined;
    let commentsMdFile: string | undefined;
    let commentsDir: string | undefined;
    let commentImagesDir: string | undefined;
    let commentImageFiles: string[] = [];
    let commentsCount = 0;
    let commentImageCount = 0;
    if (includeComments) {
      const comments = await extractPostComments(page);
      commentsCount = comments.length;
      commentsDir = ensureAbsolutePath(`${noteDir}/comments`);
      commentImagesDir = ensureAbsolutePath(`${commentsDir}/images`);
      await ensureDir(commentsDir);
      await ensureDir(commentImagesDir);

      const commentImageUrls = collectCommentImageUrls(comments);
      const commentImageResult = await downloadImages(page, commentImageUrls, commentImagesDir, overwrite);
      const dedupedCommentImage = await dedupeSavedFilesByContent(commentImageResult.saved);
      commentImageCount = dedupedCommentImage.uniqueSaved.length;
      commentImageFiles = dedupedCommentImage.uniqueSaved.map((item) => item.path);
      for (const failedItem of commentImageResult.failed) {
        failed.push(failedItem);
      }

      const imageLinkByIdentity: Record<string, string> = {};
      for (const saved of dedupedCommentImage.uniqueSaved) {
        const identity = mediaUrlIdentity(saved.url);
        const relPath = saved.path.replace(`${commentsDir}/`, "");
        imageLinkByIdentity[identity] = relPath;
      }
      for (const [identity, finalPath] of Object.entries(dedupedCommentImage.aliasByIdentity)) {
        if (imageLinkByIdentity[identity]) {
          continue;
        }
        imageLinkByIdentity[identity] = finalPath.replace(`${commentsDir}/`, "");
      }

      commentsJsonFile = await writeCommentsJson(commentsDir, comments);
      commentsMdFile = await writeCommentsMarkdown(commentsDir, comments, imageLinkByIdentity);
    }

    const result: DownloadPostResult = {
      output_dir: outputDir,
      note_dir: noteDir,
      note_id: noteId,
      post_url: canonicalPostUrl,
      publish_time: publishTime,
      post_md_file: postMdFile,
      comments_json_file: commentsJsonFile,
      comments_md_file: commentsMdFile,
      comments_dir: commentsDir,
      comment_images_dir: commentImagesDir,
      image_count: imageResult.saved.length,
      video_count: mergedVideoFiles.length,
      comments_count: commentsCount,
      comment_image_count: commentImageCount,
      failed_count: failed.length,
      failed,
      files: [
        ...imageResult.saved.map((item) => item.path),
        ...mergedVideoFiles,
        ...commentImageFiles,
        ...(commentsJsonFile ? [commentsJsonFile] : []),
        ...(commentsMdFile ? [commentsMdFile] : []),
      ],
    };

    log(
      `done: images=${result.image_count}, videos=${result.video_count}, comments=${result.comments_count}, comment_images=${result.comment_image_count}, failed=${result.failed_count}, output=${result.note_dir}`
    );
    return result;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
