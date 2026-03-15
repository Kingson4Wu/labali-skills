import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ACTION_CANDIDATES,
  AgentBrowserClient,
  DEFAULT_PROFILE_DIR,
  type ExecutorContext,
  type PublishEpisodeInputs,
  ensureReadableFile,
  promptManualLogin,
  SPOTIFY_CREATORS_URL,
  validateInputs,
  type LogFn,
} from "./core";
import { applyScheduleIfRequested, waitForPreviewReady } from "./publisher";
import {
  ensureDashboardOrShows,
  ensureLoginRoute,
  isEpisodeWizardUrl,
  isCreatorsUrl,
  isUploadSurfaceVisible,
  isSameShowByUrl,
} from "./stage-detector";
import {
  deleteDraftEpisodes,
  shouldVerifyAsScheduled,
  verifyPublishedInList,
  verifyPublishedOnly,
  verifyScheduledInList,
} from "./verifier";

async function nativeTypeRef(client: AgentBrowserClient, refKey: string, value: string): Promise<boolean> {
  if (!(await client.clickRef(refKey))) {
    return false;
  }
  await client.press("ControlOrMeta+A");
  await client.press("Backspace");
  if (!(await client.keyboardInsertText(value))) {
    return false;
  }
  await client.press("Tab");
  return true;
}

async function fillDeterministicMetadata(
  client: AgentBrowserClient,
  inputs: PublishEpisodeInputs,
  log: LogFn
): Promise<void> {
  const season = inputs.season_number?.trim() ?? "";
  const episode = inputs.episode_number?.trim() ?? "";
  const title = JSON.stringify(inputs.title);
  // Normalize line endings to Windows-style \r\n for better rich text editor compatibility
  const normalizedDescription = inputs.description.replace(/\r?\n/g, '\r\n');
  const description = JSON.stringify(normalizedDescription);
  const seasonJs = JSON.stringify(season);
  const episodeJs = JSON.stringify(episode);

  // Deterministic native-first path:
  // use stable semantic refs learned from successful policy runs.
  const snapshot = await client.snapshot();
  const refs = Object.entries(snapshot.data?.refs ?? {});
  let titleNative = false;
  let descriptionNative = false;

  for (const [refKey, refData] of refs) {
    const role = (refData.role ?? "").toLowerCase();
    const name = (refData.name ?? "").toLowerCase();
    if (!titleNative && role === "textbox" && name.includes("title")) {
      titleNative = await nativeTypeRef(client, refKey, inputs.title);
      continue;
    }
    if (!descriptionNative && role === "textbox") {
      const likelyDescription =
        name.length === 0 ||
        name.includes("what else do you want your audience to know") ||
        (name.includes("description") && !name.includes("title"));
      const blockedNoise = name.includes("shortcut") || name.includes("search");
      if (likelyDescription && !blockedNoise) {
        descriptionNative = await nativeTypeRef(client, refKey, normalizedDescription);
      }
    }
  }

  // Fallback: direct DOM sync only if native typing did not hit.
  // Use native value setter to ensure framework state updates.
  await client.evalJs(`(() => {
    const setInputValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    };

    const titleInput = document.querySelector('input[name="title"]');
    if (titleInput && !${titleNative ? "true" : "false"}) {
      setInputValue(titleInput, ${title});
    }

    const editor = Array.from(document.querySelectorAll('[contenteditable="true"]'))
      .find((node) => node && node.offsetParent !== null);
    if (editor && !${descriptionNative ? "true" : "false"}) {
      editor.focus();
      // Convert \r\n to <br> for rich text editor
      // First HTML-escape, then convert line breaks to <br>
      const htmlDesc = ${description}
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\r\\n\\r\\n/g, '<br><br>')
        .replace(/\\r\\n/g, '<br>');
      editor.innerHTML = htmlDesc;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return "ok";
  })()`);

  // Use policy executor strategy: fill season/episode via snapshot refs with spinbutton role
  // This is more reliable than evalJs DOM querying
  log(`[deterministic] Filling season=${season}, episode=${episode} via snapshot refs`);
  const seasonEpisodeRefs = Object.entries(snapshot.data?.refs ?? {})
    .filter(([, refData]) => (refData.role ?? "").toLowerCase() === "spinbutton")
    .map(([refKey]) => refKey);

  log(`[deterministic] Found ${seasonEpisodeRefs.length} spinbutton refs`);

  if (season && seasonEpisodeRefs[0]) {
    const seasonFilled = await client.fillRef(seasonEpisodeRefs[0], season);
    log(`[deterministic] Season filled via ref ${seasonEpisodeRefs[0]}: ${seasonFilled}`);
  }
  if (episode && seasonEpisodeRefs[1]) {
    const episodeFilled = await client.fillRef(seasonEpisodeRefs[1], episode);
    log(`[deterministic] Episode filled via ref ${seasonEpisodeRefs[1]}: ${episodeFilled}`);
  }

  // Verify critical fields were applied; deterministic path should fail fast if not.
  // Add detailed debug logging to help diagnose failures
  const verified = await client.evalJs(`(() => {
    const titleInput = document.querySelector('input[name="title"]');

    // Use robust selector for season/episode inputs (same as fill logic)
    const seasonInput = document.querySelector('input[name="podcastSeasonNumber"]') ||
                       document.querySelector('input[name="seasonNumber"]') ||
                       document.querySelector('input[aria-label*="Season" i]') ||
                       Array.from(document.querySelectorAll('input[type="number"]'))
                         .find((input) => {
                           const parent = input.closest('div, label');
                           const label = parent ? parent.querySelector('label, span') : null;
                           return label && (label.textContent || '').toLowerCase().includes('season');
                         });

    const episodeInput = document.querySelector('input[name="podcastEpisodeNumber"]') ||
                        document.querySelector('input[name="episodeNumber"]') ||
                        document.querySelector('input[aria-label*="Episode" i]') ||
                        Array.from(document.querySelectorAll('input[type="number"]'))
                          .find((input) => {
                            const parent = input.closest('div, label');
                            const label = parent ? parent.querySelector('label, span') : null;
                            return label && (label.textContent || '').toLowerCase().includes('episode');
                          });

    const descriptionNode = Array.from(document.querySelectorAll('[contenteditable="true"]'))
      .find((node) => node && node.offsetParent !== null);

    const titleOk = !!titleInput && (titleInput.value || '').trim().length > 0;
    const descOk = !!descriptionNode && (descriptionNode.textContent || '').trim().length > 0;
    const seasonOk = !${seasonJs} || (!!seasonInput && (seasonInput.value || '').trim() === ${seasonJs});
    const episodeOk = !${episodeJs} || (!!episodeInput && (episodeInput.value || '').trim() === ${episodeJs});

    // Debug: log actual values for troubleshooting
    const debugInfo = {
      titleValue: titleInput ? (titleInput.value || '').trim() : 'missing',
      descLength: descriptionNode ? (descriptionNode.textContent || '').trim().length : 'missing',
      seasonValue: seasonInput ? (seasonInput.value || '').trim() : 'missing',
      episodeValue: episodeInput ? (episodeInput.value || '').trim() : 'missing',
      expectedSeason: ${seasonJs},
      expectedEpisode: ${episodeJs}
    };

    return JSON.stringify({ 
      titleOk, 
      descOk, 
      seasonOk, 
      episodeOk,
      debugInfo
    });
  })()`);
  const parsed = JSON.parse(verified || "{}") as unknown;
  const result = (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as {
    titleOk?: boolean;
    descOk?: boolean;
    seasonOk?: boolean;
    episodeOk?: boolean;
    debugInfo?: {
      titleValue?: string;
      descLength?: number | string;
      seasonValue?: string;
      episodeValue?: string;
      expectedSeason?: string;
      expectedEpisode?: string;
    };
  };
  if (!result.titleOk || !result.descOk || !result.seasonOk || !result.episodeOk) {
    log(`[deterministic-debug] Metadata verification failed: ${JSON.stringify(result)}`);
    throw new Error(
      `Deterministic metadata verify failed: titleOk=${result.titleOk}, descOk=${result.descOk}, seasonOk=${result.seasonOk}, episodeOk=${result.episodeOk}. Debug: ${JSON.stringify(result.debugInfo)}`
    );
  }
  log(`[deterministic-debug] Metadata verification passed: ${JSON.stringify(result.debugInfo)}`);

  // Learned guard from policy recovery: if required counter still shows 0/4000,
  // deterministic path should fail fast so policy executor can take over.
  const requiredCounter = await client.evalJs(`(() => {
    const text = (document.body && document.body.innerText) ? document.body.innerText : "";
    return /Required\\s*0\\s*\\/\\s*4000/i.test(text) ? "required-0" : "required-ok";
  })()`);
  if (requiredCounter.includes("required-0")) {
    throw new Error("Deterministic metadata unresolved: description required counter remains 0/4000.");
  }
}

async function waitNextReady(client: AgentBrowserClient): Promise<boolean> {
  const out = await client.evalJs(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const next = buttons.find((b) => (b.textContent || '').trim().toLowerCase() === 'next');
    if (!next) return JSON.stringify({ found: false, ready: false });
    const disabled = !!next.disabled || next.getAttribute('aria-disabled') === 'true';
    return JSON.stringify({ found: true, ready: !disabled });
  })()`);
  const parsed = JSON.parse(out || "{}") as unknown;
  const state = (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as {
    found?: boolean;
    ready?: boolean;
  };
  return Boolean(state.found && state.ready);
}

async function advanceDeterministicToPublish(client: AgentBrowserClient, log: LogFn): Promise<void> {
  log("[deterministic] Advancing to publish step...");
  
  for (let i = 0; i < 10; i += 1) {
    // Check if we've reached the publish step
    const hasPublish = await client.waitForTextAny(
      ["Publish", "Publish episode", "Save and publish", "Schedule"],
      1500
    );
    if (hasPublish) {
      log(`[deterministic] Reached publish step after ${i} iterations`);
      return;
    }

    // Debug: log current page state
    const pageState = await client.evalJs(`(() => {
      const allText = document.body ? document.body.innerText.slice(0, 500) : '';
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
        .map(b => (b.textContent || '').trim())
        .filter(t => t.length > 0)
        .slice(0, 10);
      const inputs = Array.from(document.querySelectorAll('input'))
        .map((input: HTMLInputElement) => ({
          name: input.name,
          type: input.type,
          value: (input.value || '').slice(0, 20),
          hasValue: !!(input.value && (input.value as string).trim())
        }))
        .slice(0, 5);
      return JSON.stringify({ buttons, inputs, allText: allText.replace(/\s+/g, ' ').trim() });
    })()`);
    log(`[deterministic] Page state at iteration ${i}: ${pageState}`);

    const nextReady = await waitNextReady(client);
    if (!nextReady) {
      log(`[deterministic] Next button not ready at iteration ${i}, waiting...`);
      await client.waitMs(3000);
      continue;
    }

    log(`[deterministic] Clicking Next/Continue at iteration ${i}`);
    await client.clickRoleByNames("button", ["Next", "Continue", "Review"]);
    await client.waitMs(2500);
  }

  throw new Error("Deterministic flow did not reach publish step after bounded Next attempts.");
}

export async function executeDeterministic(
  inputs: PublishEpisodeInputs,
  context: ExecutorContext = {}
): Promise<{ status: "published" | "scheduled"; show: string; url: string }> {
  validateInputs(inputs);
  const log: LogFn = context.logger ?? ((msg) => console.log(`[spotify-publish-deterministic] ${msg}`));

  const audioFile = await ensureReadableFile(inputs.audio_file, "audio_file");
  const profileDir = resolve(inputs.profile_dir ?? DEFAULT_PROFILE_DIR);
  await mkdir(profileDir, { recursive: true });

  const client = await AgentBrowserClient.create(
    profileDir,
    inputs.headed ?? true,
    inputs.cdp_port,
    log
  );

  try {
    const showHome = inputs.show_home_url ?? SPOTIFY_CREATORS_URL;
    const episodesPage = `${showHome.replace(/\/home$/, "")}/episodes?filter=PUBLISHED_EPISODES&currentPage=1`;
    const currentUrl = await client.getUrl();

    if (isEpisodeWizardUrl(currentUrl)) {
      log(`Reuse deterministic wizard page: ${currentUrl}`);
    } else if (isCreatorsUrl(currentUrl) && isSameShowByUrl(currentUrl, showHome)) {
      log(`Reuse deterministic entry page: ${currentUrl}`);
    } else {
      log(`Open deterministic entry: ${episodesPage}`);
      await client.open(episodesPage);
    }
    await ensureLoginRoute(client);

    const loginState = await ensureDashboardOrShows(client);
    if (loginState === "logged-out") {
      log("Manual login required. Complete login in the opened browser window.");
      await promptManualLogin("Sign in to Spotify for Creators manually.", context.prompt);
      await client.waitForTextAny(ACTION_CANDIDATES.dashboardMarkers, 120000);
    }

    const currentStageUrl = await client.getUrl();
    const wizardVisible = isEpisodeWizardUrl(currentStageUrl);
    const uploadVisible = await isUploadSurfaceVisible(client);

    // Debug: log current page state
    const pageStateDebug = await client.evalJs(`(() => {
      const titleInput = document.querySelector('input[name="title"]');
      const uploadButton = document.querySelector('button[data-testid="upload-audio-button"]');
      const descriptionEditor = document.querySelector('[contenteditable="true"]');
      const allInputs = Array.from(document.querySelectorAll('input'))
        .slice(0, 10)
        .map((input: HTMLInputElement) => ({ name: input.name, type: input.type, value: (input.value || '').slice(0, 20) }));
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
        .slice(0, 15)
        .map((b) => (b.textContent || '').trim().slice(0, 30));
      return JSON.stringify({
        url: window.location.href,
        hasTitleInput: !!titleInput,
        hasUploadButton: !!uploadButton,
        hasDescriptionEditor: !!descriptionEditor,
        allInputs: allInputs,
        buttons: buttons
      });
    })()`);
    log(`[deterministic-debug] Page state before wizard check: ${pageStateDebug}`);
    log(`[deterministic-debug] wizardVisible=${wizardVisible}, uploadVisible=${uploadVisible}, currentUrl=${currentStageUrl}`);

    // Always start fresh from show home to avoid stale wizard state
    // This is the key difference from previous deterministic approach
    // showHome is already defined above, reuse it here

    if (wizardVisible && uploadVisible) {
      // Check if this is a clean wizard (no user data entered)
      const wizardState = await client.evalJs(`(() => {
        const titleInput = document.querySelector('input[name="title"]');
        const titleValue = titleInput ? (titleInput.value || '').trim() : '';
        const hasAudio = document.querySelector('button[data-testid="upload-audio-button"]') !== null ||
                        document.querySelector('[data-testid="upload-progress"]') !== null;
        const descriptionEditor = document.querySelector('[contenteditable="true"]');
        const descText = descriptionEditor ? (descriptionEditor.textContent || '').trim() : '';
        return JSON.stringify({
          hasTitle: titleValue.length > 0,
          hasAudio,
          hasDescription: descText.length > 0,
          wizardVisible: true,
          uploadVisible: true
        });
      })()`);

      const wizardStateParsed = JSON.parse(wizardState);
      log(`[deterministic] Wizard state check: ${JSON.stringify(wizardStateParsed)}`);

      // Only reuse wizard if completely empty (no title, no audio, no description)
      if (wizardStateParsed.hasTitle || wizardStateParsed.hasAudio || wizardStateParsed.hasDescription) {
        log("[deterministic] Wizard has partial data, resetting to show home...");
        await client.open(showHome);
        await client.waitMs(2000);
      } else {
        log("[deterministic] Reusing clean empty wizard");
      }
    }

    if (!wizardVisible || !uploadVisible) {
      log("Open create episode flow from show home");
      await client.open(showHome);
      await client.waitMs(2000);
      
      log("Click New episode");
      try {
        await client.clickRoleByNames("link", ["New episode"]);
      } catch {
        await client.clickRoleByNames("link", ["Create a new episode"]);
      }
      await client.waitMs(4000);
    } else {
      log(`Reuse clean wizard: ${currentStageUrl}`);
    }

    // Always upload audio (deterministic approach - no skip logic)
    log("Upload audio");
    const beforeUploadState = await client.evalJs(`(() => {
      const hasAudioBefore = document.querySelector('button[data-testid="upload-audio-button"]') !== null ||
                            document.querySelector('[data-testid="upload-progress"]') !== null ||
                            document.querySelector('[class*="upload-complete"]') !== null;
      return hasAudioBefore ? 'has-audio' : 'no-audio';
    })()`);
    log(`[deterministic] Before upload state: ${beforeUploadState}`);
    
    await client.uploadBySemanticCandidates(ACTION_CANDIDATES.audioUpload, audioFile);
    await client.waitMs(5000);
    
    const afterUploadState = await client.evalJs(`(() => {
      const progressEl = document.querySelector('[data-testid="upload-progress"]');
      const completeEl = document.querySelector('[class*="upload-complete"]');
      const filenameEl = document.querySelector('[class*="filename"]');
      return JSON.stringify({
        hasProgress: !!progressEl,
        hasComplete: !!completeEl,
        filename: filenameEl ? (filenameEl.textContent || '').trim() : 'none',
        bodyText: (document.body.innerText || '').slice(0, 200).replace(/\s+/g, ' ')
      });
    })()`);
    log(`[deterministic] After upload state: ${afterUploadState}`);

    log("Fill deterministic metadata");
    await fillDeterministicMetadata(client, inputs, log);
    await client.waitMs(1500);

    log("Next to publish step");
    await advanceDeterministicToPublish(client, log);

    if (shouldVerifyAsScheduled(inputs.publish_at)) {
      log(`Apply deterministic schedule: ${inputs.publish_at}`);
      await applyScheduleIfRequested(client, inputs.publish_at);
    } else {
      log("Select Now and Publish");
      try {
        await client.clickRoleByNames("radio", ["Now"]);
      } catch {
        await client.evalJs(
          "(() => { const label = document.querySelector('label[for=\"publish-date-now\"]'); if (label) label.click(); const input = document.getElementById('publish-date-now'); if (input) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); } return 'ok'; })()"
        );
      }
    }
    log("Wait for upload preview to be ready before publish");
    await waitForPreviewReady(
      client,
      shouldVerifyAsScheduled(inputs.publish_at) ? "schedule" : "publish"
    );
    await client.clickRoleByNames(
      "button",
      shouldVerifyAsScheduled(inputs.publish_at)
        ? ["Schedule"]
        : ["Publish", "Publish episode", "Save and publish"]
    );
    await client.waitMs(3000);

    if (shouldVerifyAsScheduled(inputs.publish_at)) {
      const scheduledConfirmed = await verifyScheduledInList(client, inputs.title, inputs.show_home_url);
      if (!scheduledConfirmed) {
        throw new Error("Deterministic schedule completed but episode not found in Scheduled.");
      }
    } else {
      const publishedConfirmed = await verifyPublishedInList(client, inputs.title, inputs.show_home_url);
      if (!publishedConfirmed) {
        const foundInPublishedOnly = await verifyPublishedOnly(client, inputs.title, inputs.show_home_url);
        if (!foundInPublishedOnly) {
          throw new Error("Deterministic publish completed but episode not found in Published.");
        }
        throw new Error("Deterministic publish found title in Published and Draft simultaneously.");
      }
    }

    await deleteDraftEpisodes(
      client,
      [inputs.title, "Untitled"],
      inputs.show_home_url
    );

    return {
      status: shouldVerifyAsScheduled(inputs.publish_at) ? "scheduled" : "published",
      show: inputs.show_name ?? inputs.show_id ?? "unknown-show",
      url: await client.getUrl(),
    };
  } finally {
    await client.close();
  }
}

export default executeDeterministic;
