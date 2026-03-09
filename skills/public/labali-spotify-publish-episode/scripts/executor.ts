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
  retry,
  SPOTIFY_CREATORS_URL,
  validateInputs,
  type LogFn,
} from "./core";
import {
  ensureDashboardOrShows,
  ensureLoginRoute,
  isCreatorsUrl,
  isEpisodeCreatorVisible,
  isEpisodeWizardUrl,
  isSameShowByUrl,
  isUploadSurfaceVisible,
  openEpisodeCreator,
  selectShow,
  uploadEpisodeAudio,
} from "./stage-detector";
import { applyScheduleIfRequested, publishEpisode } from "./publisher";
import { verifyPublishedInList, verifyPublishedOnly } from "./verifier";

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

async function nativeTypeByPredicate(
  client: AgentBrowserClient,
  predicate: (name: string, role: string) => boolean,
  value: string
): Promise<boolean> {
  const snapshot = await client.snapshot();
  const refs = snapshot.data?.refs ?? {};
  for (const [refKey, refData] of Object.entries(refs)) {
    const role = (refData.role ?? "").toLowerCase();
    const name = (refData.name ?? "").toLowerCase();
    if (!predicate(name, role)) {
      continue;
    }
    if (await nativeTypeRef(client, refKey, value)) {
      return true;
    }
  }
  return false;
}

async function fillEpisodeMetadata(client: AgentBrowserClient, inputs: PublishEpisodeInputs): Promise<void> {
  // Native path first: prefer keyboard-based input to trigger frontend model events.
  {
    const titleFilled = await nativeTypeByPredicate(
      client,
      (name, role) => role === "textbox" && name.includes("title"),
      inputs.title
    );
    if (!titleFilled) {
      await retry(2, async () => {
        try {
          await client.fillByLabelCandidates(ACTION_CANDIDATES.titleLabels, inputs.title);
        } catch {
          await client.fillByPlaceholderCandidates(ACTION_CANDIDATES.titleLabels, inputs.title);
        }
      });
    }
  }

  await retry(2, async () => {
    const nativeDescriptionFilled = await nativeTypeByPredicate(
      client,
      (name, role) =>
        role === "textbox" &&
        !name.includes("title") &&
        !name.includes("shortcut") &&
        !name.includes("search"),
      inputs.description
    );
    if (nativeDescriptionFilled) {
      return;
    }

    try {
      await client.fillByLabelCandidates(ACTION_CANDIDATES.descriptionLabels, inputs.description);
      return;
    } catch {
      // continue
    }

    try {
      await client.fillByPlaceholderCandidates(ACTION_CANDIDATES.descriptionLabels, inputs.description);
      return;
    } catch {
      // continue
    }

    throw new Error("Failed to fill episode description with semantic and editor fallbacks.");
  });

  // Some editor variants still require a focused native paste to update required-state counters.
  await client.evalJs(`(() => {
    const targets = Array.from(document.getElementsByTagName("*")).filter((node) => {
      const role = (node.getAttribute("role") || "").toLowerCase();
      const name = (node.getAttribute("name") || "").toLowerCase();
      const editable = node.getAttribute("contenteditable") === "true";
      return editable && role === "textbox" && name.includes("description");
    });
    for (const node of targets) {
      node.textContent = ${JSON.stringify(inputs.description)};
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      node.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    return String(targets.length);
  })()`);

  const descriptionVerified = await client.evalJs(`(() => {
    const nodes = Array.from(document.getElementsByTagName("*")).filter((node) => {
      const role = (node.getAttribute("role") || "").toLowerCase();
      const name = (node.getAttribute("name") || "").toLowerCase();
      const editable = node.getAttribute("contenteditable") === "true";
      return editable && role === "textbox" && name.includes("description");
    });
    return nodes.some((node) => (node.textContent || "").trim().length > 0) ? "ok" : "empty";
  })()`);
  let normalizedVerify = descriptionVerified.trim();
  if (normalizedVerify.startsWith("\"") && normalizedVerify.endsWith("\"")) {
    try {
      normalizedVerify = JSON.parse(normalizedVerify) as string;
    } catch {
      // keep original
    }
  }
  if (normalizedVerify !== "ok") {
    throw new Error("Description remains empty after DOM fallback sync.");
  }

  const hasRequiredCounter = await client.evalJs(`(() => {
    const text = (document.body && document.body.innerText) ? document.body.innerText : "";
    return /Required\\s*0\\s*\\/\\s*4000/i.test(text) ? "yes" : "no";
  })()`);

  if (hasRequiredCounter.trim().includes("yes")) {
    const focused = await client.evalJs(`(() => {
      const nodes = Array.from(document.getElementsByTagName("*")).filter((node) => {
        const role = (node.getAttribute("role") || "").toLowerCase();
        const name = (node.getAttribute("name") || "").toLowerCase();
        const editable = node.getAttribute("contenteditable") === "true";
        return editable && role === "textbox" && name.includes("description");
      });
      if (nodes[0]) {
        nodes[0].focus();
        return "focused";
      }
      return "no-target";
    })()`);
    if (focused.includes("focused")) {
      await client.press("ControlOrMeta+A");
      await client.press("Backspace");
      await client.keyboardInsertText(inputs.description);
      await client.press("Tab");
    }
  }
}

async function fillOptionalNumericField(
  client: AgentBrowserClient,
  labels: string[],
  value: string | undefined
): Promise<boolean> {
  if (!value?.trim()) {
    return false;
  }
  const normalizedValue = value.trim();
  try {
    await retry(2, async () => {
      try {
        await client.fillByLabelCandidates(labels, normalizedValue);
        return;
      } catch {
        // continue
      }
      try {
        await client.fillByPlaceholderCandidates(labels, normalizedValue);
        return;
      } catch {
        // continue
      }

      const snapshot = await client.snapshot();
      const refs = snapshot.data?.refs ?? {};
      for (const [refKey, refData] of Object.entries(refs)) {
        const role = (refData.role ?? "").toLowerCase();
        const name = (refData.name ?? "").toLowerCase();
        if (role !== "spinbutton" && role !== "textbox") {
          continue;
        }
        if (!labels.some((label) => name.includes(label.toLowerCase()))) {
          continue;
        }
        if (await client.fillRef(refKey, normalizedValue)) {
          return;
        }
      }

      throw new Error(`Failed to fill optional numeric field: ${labels.join(", ")}`);
    });
    return true;
  } catch {
    return false;
  }
}

async function fillSeasonEpisodeSpinbuttonFallback(
  client: AgentBrowserClient,
  seasonNumber?: string,
  episodeNumber?: string
): Promise<void> {
  if (!seasonNumber?.trim() && !episodeNumber?.trim()) {
    return;
  }

  const snapshot = await client.snapshot();
  const refs = Object.entries(snapshot.data?.refs ?? {})
    .filter(([, refData]) => (refData.role ?? "").toLowerCase() === "spinbutton")
    .map(([refKey]) => refKey);

  if (seasonNumber?.trim() && refs[0]) {
    await client.fillRef(refs[0], seasonNumber.trim());
  }
  if (episodeNumber?.trim() && refs[1]) {
    await client.fillRef(refs[1], episodeNumber.trim());
  }
}

async function ensureMetadataRequiredFields(
  client: AgentBrowserClient,
  inputs: PublishEpisodeInputs,
  log: LogFn
): Promise<void> {
  const metadataVisible =
    (await client.hasText("Title (required)")) ||
    ((await client.hasText("Upload new file")) && (await client.hasText("Next")));
  if (!metadataVisible) {
    return;
  }

  log("Ensure required metadata fields before next step");
  await fillEpisodeMetadata(client, inputs);
  const seasonFilled = await fillOptionalNumericField(
    client,
    ACTION_CANDIDATES.seasonLabels,
    inputs.season_number
  );
  const episodeFilled = await fillOptionalNumericField(
    client,
    ACTION_CANDIDATES.episodeLabels,
    inputs.episode_number
  );
  if (!seasonFilled || !episodeFilled) {
    await fillSeasonEpisodeSpinbuttonFallback(client, inputs.season_number, inputs.episode_number);
  }
}

export async function execute(inputs: PublishEpisodeInputs, context: ExecutorContext = {}): Promise<{
  status: "published";
  show: string;
  url: string;
}> {
  validateInputs(inputs);
  const confirmPublish = inputs.confirm_publish ?? true;
  const log: LogFn = context.logger ?? ((msg) => console.log(`[spotify-publish] ${msg}`));

  const audioFile = await ensureReadableFile(inputs.audio_file, "audio_file");
  const coverImage = inputs.cover_image
    ? await ensureReadableFile(inputs.cover_image, "cover_image")
    : undefined;

  const profileDir = resolve(inputs.profile_dir ?? DEFAULT_PROFILE_DIR);
  await mkdir(profileDir, { recursive: true });

  const client = new AgentBrowserClient(
    profileDir,
    inputs.headed ?? true,
    inputs.cdp_port,
    log
  );
  const runStartedAt = Date.now();
  const stepDurations: Record<string, number> = {};

  const timed = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      const elapsedMs = Date.now() - startedAt;
      stepDurations[step] = (stepDurations[step] ?? 0) + elapsedMs;
      log(`[timing] ${step}: ${(elapsedMs / 1000).toFixed(1)}s`);
    }
  };

  try {
    let metadataEnsured = false;
    const targetUrl = inputs.show_home_url ?? SPOTIFY_CREATORS_URL;
    await timed("entry", async () => {
      const currentUrl = await client.getUrl();
      const inEpisodeWizardContext = /\/episode\/[^/]+\/wizard/i.test(currentUrl);
      if (isCreatorsUrl(currentUrl) && !(inEpisodeWizardContext && inputs.show_home_url)) {
        log(`Reuse already opened page: ${currentUrl}`);
      } else {
        if (inEpisodeWizardContext && inputs.show_home_url) {
          log(`Reset from episode wizard context to show home: ${inputs.show_home_url}`);
        } else {
          log(`Open ${targetUrl}`);
        }
        await client.open(targetUrl);
      }
      await ensureLoginRoute(client);
    });

    const loginState = await timed("login-state-check", async () => ensureDashboardOrShows(client));
    if (loginState !== "logged-in") {
      await timed("manual-login", async () => {
        log("Manual login required. Complete login in the opened browser window.");
        await promptManualLogin(
          "Sign in to Spotify for Creators manually.",
          context.prompt
        );
        await client.waitForTextAny(ACTION_CANDIDATES.dashboardMarkers, 120000);
      });
    }

    const postLoginUrl = await client.getUrl();
    const alreadyInTargetShow =
      isSameShowByUrl(postLoginUrl, inputs.show_home_url) ||
      ((await client.hasText(inputs.show_name)) && (await isEpisodeCreatorVisible(client)));

    if (alreadyInTargetShow) {
      log(`Target show already open: ${postLoginUrl}`);
    } else {
      await timed("show-selection", async () => {
        log(`Select show '${inputs.show_name}'`);
        try {
          await selectShow(client, inputs.show_name);
          await client.waitForLoad();
        } catch (error) {
          const creatorVisible = await isEpisodeCreatorVisible(client);
          if (!creatorVisible) {
            throw error;
          }
          log("Show selector not found, but episode creation entry is visible. Continue.");
        }
      });
    }

    const beforeCreateUrl = await client.getUrl();
    const alreadyInWizard = isEpisodeWizardUrl(beforeCreateUrl);
    const uploadReady = await isUploadSurfaceVisible(client);
    if (alreadyInWizard || uploadReady) {
      log(`Skip create episode flow: already in upload wizard (${beforeCreateUrl})`);
    } else {
      await timed("open-create-episode", async () => {
        log("Open create episode flow");
        await openEpisodeCreator(client);
        await client.waitForLoad();
      });
    }

    const atPublishStage = (await client.hasText("Publish")) && (await client.hasText("Now"));
    const hasAudioAlready = atPublishStage || (await client.hasText("Upload new file"));
    if (hasAudioAlready) {
      log("Skip audio upload: existing uploaded media detected.");
    } else {
      await timed("audio-upload", async () => {
        log("Upload episode audio");
        await uploadEpisodeAudio(client, audioFile);
      });
    }

    const atMetadataStage = await timed("metadata-stage-detect", async () => {
      for (let i = 0; i < 15; i += 1) {
        const hasMetadataMarker =
          (await client.hasText("Title (required)")) ||
          (await client.hasText("Episode title")) ||
          (await client.hasText("Episode description")) ||
          ((await client.hasText("Upload new file")) && (await client.hasText("Next")));
        if (hasMetadataMarker) {
          return true;
        }

        const hasPublishMarker = (await client.hasText("Publish")) || (await client.hasText("Schedule"));
        if (hasPublishMarker) {
          return false;
        }

        await client.waitMs(2000);
      }
      return false;
    });

    if (atMetadataStage) {
      await timed("metadata-fill", async () => {
        log("Fill episode title and description");
        await ensureMetadataRequiredFields(client, inputs, log);
        metadataEnsured = true;
      });
    } else {
      log("Skip metadata fill: not on details step.");
    }

    // Final guard: never enter publish flow while required metadata fields are visible.
    if (!metadataEnsured) {
      await timed("metadata-guard", async () => ensureMetadataRequiredFields(client, inputs, log));
      metadataEnsured = true;
    } else {
      log("[timing] metadata-guard: 0.0s (skipped; already ensured in metadata-fill)");
    }

    if (coverImage) {
      await timed("cover-upload", async () => {
        log("Upload episode cover image");
        await retry(3, async () => {
          await client.uploadBySemanticCandidates(ACTION_CANDIDATES.coverUpload, coverImage);
        });
      });
    }

    if (inputs.publish_at) {
      log(`Configure schedule for ${inputs.publish_at}`);
    }
    await timed("schedule-config", async () => applyScheduleIfRequested(client, inputs.publish_at));

    await timed("publish-action", async () => {
      log("Publish episode");
      await publishEpisode(client, confirmPublish);
    });

    const publishedConfirmed = await timed("verify-published", async () =>
      verifyPublishedInList(
        client,
        inputs.title,
        inputs.show_home_url
      )
    );
    if (!publishedConfirmed) {
      const foundInPublishedOnly = await timed("verify-published-only", async () =>
        verifyPublishedOnly(
          client,
          inputs.title,
          inputs.show_home_url
        )
      );
      if (!foundInPublishedOnly) {
        throw new Error("Publish action completed but episode not found in Published list.");
      }
      throw new Error(
        "Episode appears in Published list but still exists in Draft list. Review publish-date required fields in wizard."
      );
    }

    const url = await client.getUrl();
    const totalMs = Date.now() - runStartedAt;
    const sorted = Object.entries(stepDurations).sort((a, b) => b[1] - a[1]);
    const topSteps = sorted.slice(0, 6).map(([name, ms]) => `${name}=${(ms / 1000).toFixed(1)}s`);
    log(`[timing] total: ${(totalMs / 1000).toFixed(1)}s`);
    log(`[timing] top-steps: ${topSteps.join(", ")}`);
    return {
      status: "published",
      show: inputs.show_name,
      url,
    };
  } catch (error) {
    const failureShot = `./spotify-publish-failure-${Date.now()}.png`;
    await client.screenshot(failureShot);
    log(`Failure screenshot: ${failureShot}`);
    throw error;
  } finally {
    const totalMs = Date.now() - runStartedAt;
    log(`[timing] total-final: ${(totalMs / 1000).toFixed(1)}s`);
    await client.close();
  }
}

export type { PublishEpisodeInputs, ExecutorContext } from "./core";

export default execute;
