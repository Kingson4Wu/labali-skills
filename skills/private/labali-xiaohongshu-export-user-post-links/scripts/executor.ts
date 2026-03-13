import { chromium, type Page } from "playwright";
import { createInterface } from "node:readline/promises";
import {
  DEFAULT_CDP_PORT,
  DEFAULT_PROFILE_DIR,
  buildExploreUrl,
  canonicalizeProfileUrl,
  ensureChromeWithRemoteDebugging,
  ensureWritableTarget,
  ensureAbsolutePath,
  extractPublishTimeFromPostPage,
  extractPostCardsFromState,
  isLoginRequired,
  resolveOutputFile,
  scrollForNextPage,
  validateProfileUrl,
  waitForManualLogin,
  writeLinksFile,
  type ExportedPostRecord,
  type ExportUserPostLinksInputs,
  type ExportUserPostLinksResult,
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

function toMaxScrollRounds(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 80;
  }
  return Math.max(5, Math.min(value, 400));
}

function toLimit(value: number | undefined): number | undefined {
  if (!value || Number.isNaN(value)) {
    return undefined;
  }
  return Math.max(1, Math.min(value, 200));
}

function toCandidateTarget(limit: number | undefined): number | undefined {
  if (!limit) {
    return undefined;
  }
  return Math.min(Math.max(limit + 3, limit * 2), 40);
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

export async function execute(
  inputs: ExportUserPostLinksInputs,
  context?: ExecutorContext
): Promise<ExportUserPostLinksResult> {
  const log = context?.logger ?? ((message: string) => console.log(`[xhs-user-post-links] ${message}`));

  const profileDir = ensureAbsolutePath(inputs.profile_dir || DEFAULT_PROFILE_DIR);
  const cdpPort = (inputs.cdp_port || DEFAULT_CDP_PORT).trim();
  const timeoutMs = toTimeout(inputs.timeout_ms);
  const maxScrollRounds = toMaxScrollRounds(inputs.max_scroll_rounds);
  const includeToken = inputs.include_token ?? true;
  const includePublishTime = inputs.include_publish_time ?? false;
  const excludeSticky = inputs.exclude_sticky ?? false;
  const limit = toLimit(inputs.limit);
  const candidateTarget = toCandidateTarget(limit);

  await ensureChromeWithRemoteDebugging(cdpPort, profileDir, log);
  log(`connecting over CDP on :${cdpPort}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);

  try {
    const browserContext = browser.contexts()[0] ?? (await browser.newContext());
    const page = browserContext.pages()[0] ?? (await browserContext.newPage());

    log(`opening Xiaohongshu home for login warmup: ${XHS_HOME_URL}`);
    await page.goto(XHS_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(900);

    if (await isHomeLoginRequired(page)) {
      log("home page suggests login is required, waiting for manual login");
      if (context?.prompt) {
        await context.prompt("请在打开的浏览器中完成小红书登录，然后继续。");
      } else {
        await waitForManualLogin("检测到可能未登录。请先在当前浏览器窗口登录小红书。");
      }
      await page.goto(XHS_HOME_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(900);
    }

    let profileUrl = inputs.profile_url?.trim();
    if (!profileUrl) {
      profileUrl = await promptRequired("请输入小红书用户主页链接 (--profile_url): ");
    }
    validateProfileUrl(profileUrl);

    const outputPathInput = inputs.output_path?.trim()
      ? inputs.output_path.trim()
      : await promptWithDefault(
          "请输入输出文件路径或目录 (--output_path, 默认 ./downloads/xhs-post-links.txt): ",
          "./downloads/xhs-post-links.txt"
        );

    const outputFile = await resolveOutputFile(outputPathInput, profileUrl);
    await ensureWritableTarget(outputFile);

    log(`opening profile URL: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    await page.waitForTimeout(1400);

    if (await isLoginRequired(page)) {
      log("profile page appears login-gated, waiting for manual login");
      if (context?.prompt) {
        await context.prompt("请在打开的浏览器中完成小红书登录，然后继续。");
      } else {
        await waitForManualLogin("访问用户主页需要登录，请先完成登录。");
      }
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
      await page.waitForTimeout(1400);
    }

    const cardsByNoteId = new Map<string, ExportedPostRecord>();
    let stagnantRounds = 0;

    for (let round = 1; round <= maxScrollRounds; round += 1) {
      const cards = await extractPostCardsFromState(page);
      const before = cardsByNoteId.size;

      for (const card of cards) {
        if (!card.noteId || cardsByNoteId.has(card.noteId)) {
          continue;
        }
        cardsByNoteId.set(card.noteId, {
          note_id: card.noteId,
          url: buildExploreUrl(card.noteId, card.xsecToken, includeToken),
          title: card.title,
          sticky: card.sticky,
          profile_index: card.profileIndex,
        });
      }

      const allRecords = Array.from(cardsByNoteId.values()).sort((a, b) => a.profile_index - b.profile_index);
      const exportableCount = allRecords.filter((record) => !excludeSticky || !record.sticky).length;
      const after = cardsByNoteId.size;
      log(`round=${round} cards=${cards.length} unique_posts=${after}`);

      if (after === before) {
        stagnantRounds += 1;
      } else {
        stagnantRounds = 0;
      }

      if (candidateTarget && exportableCount >= candidateTarget) {
        log(`candidate target reached: exportable_posts=${exportableCount}, limit=${limit}`);
        break;
      }

      if (stagnantRounds >= 4) {
        break;
      }

      await scrollForNextPage(page);
    }

    const allRecords = Array.from(cardsByNoteId.values()).sort((a, b) => a.profile_index - b.profile_index);
    let selectedRecords = allRecords.filter((record) => !excludeSticky || !record.sticky);
    if (selectedRecords.length === 0) {
      throw new Error("No post links extracted from profile page.");
    }

    if (limit) {
      selectedRecords = selectedRecords.slice(0, candidateTarget ?? limit);
    }

    const shouldFetchPublishTime = includePublishTime || Boolean(limit);
    if (shouldFetchPublishTime && selectedRecords.length > 0) {
      const detailPage = await browserContext.newPage();
      try {
        for (const record of selectedRecords) {
          await detailPage.goto(record.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
          await detailPage.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
          await detailPage.waitForTimeout(900);
          record.publish_time = await extractPublishTimeFromPostPage(detailPage, record.note_id);
        }
      } finally {
        await detailPage.close().catch(() => undefined);
      }
    }

    if (limit) {
      selectedRecords.sort((a, b) => {
        const aTime = Number(a.publish_time || 0);
        const bTime = Number(b.publish_time || 0);
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return a.profile_index - b.profile_index;
      });
      selectedRecords = selectedRecords.slice(0, limit);
    }

    const finalLinks = selectedRecords.map((record) => record.url);
    await writeLinksFile(outputFile, selectedRecords, includePublishTime);

    const result: ExportUserPostLinksResult = {
      profile_url: profileUrl,
      canonical_profile_url: canonicalizeProfileUrl(profileUrl),
      output_file: outputFile,
      total_links: finalLinks.length,
      links: finalLinks,
      records: selectedRecords,
    };

    log(`done: total_links=${result.total_links}, output=${result.output_file}`);
    return result;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
