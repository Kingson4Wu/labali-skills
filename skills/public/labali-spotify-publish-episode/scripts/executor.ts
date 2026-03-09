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

async function fillEpisodeMetadata(client: AgentBrowserClient, inputs: PublishEpisodeInputs): Promise<void> {
  await retry(3, async () => {
    try {
      await client.fillByLabelCandidates(ACTION_CANDIDATES.titleLabels, inputs.title);
    } catch {
      await client.fillByPlaceholderCandidates(ACTION_CANDIDATES.titleLabels, inputs.title);
    }
  });

  await retry(3, async () => {
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

    const snapshot = await client.snapshot();
    const refs = snapshot.data?.refs ?? {};
    for (const [refKey, refData] of Object.entries(refs)) {
      const role = (refData.role ?? "").toLowerCase();
      const name = (refData.name ?? "").toLowerCase();
      if (role !== "textbox") {
        continue;
      }
      if (name.includes("title")) {
        continue;
      }
      if (await client.fillRef(refKey, inputs.description)) {
        return;
      }
      if (await client.clickRef(refKey)) {
        if (await client.keyboardInsertText(inputs.description)) {
          return;
        }
      }
    }

    await client.press("Tab");
    if (await client.keyboardInsertText(inputs.description)) {
      return;
    }

    throw new Error("Failed to fill episode description with semantic and editor fallbacks.");
  });
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

  try {
    const currentUrl = await client.getUrl();
    const targetUrl = inputs.show_home_url ?? SPOTIFY_CREATORS_URL;

    if (isCreatorsUrl(currentUrl)) {
      log(`Reuse already opened page: ${currentUrl}`);
    } else {
      log(`Open ${targetUrl}`);
      await client.open(targetUrl);
    }
    await ensureLoginRoute(client);

    const loginState = await ensureDashboardOrShows(client);
    if (loginState !== "logged-in") {
      log("Manual login required. Complete login in the opened browser window.");
      await promptManualLogin(
        "Sign in to Spotify for Creators manually.",
        context.prompt
      );
      await client.waitForTextAny(ACTION_CANDIDATES.dashboardMarkers, 120000);
    }

    const postLoginUrl = await client.getUrl();
    const alreadyInTargetShow =
      isSameShowByUrl(postLoginUrl, inputs.show_home_url) ||
      ((await client.hasText(inputs.show_name)) && (await isEpisodeCreatorVisible(client)));

    if (alreadyInTargetShow) {
      log(`Target show already open: ${postLoginUrl}`);
    } else {
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
    }

    const beforeCreateUrl = await client.getUrl();
    const alreadyInWizard = isEpisodeWizardUrl(beforeCreateUrl);
    const uploadReady = await isUploadSurfaceVisible(client);
    if (alreadyInWizard || uploadReady) {
      log(`Skip create episode flow: already in upload wizard (${beforeCreateUrl})`);
    } else {
      log("Open create episode flow");
      await openEpisodeCreator(client);
      await client.waitForLoad();
    }

    const atPublishStage = (await client.hasText("Publish")) && (await client.hasText("Now"));
    const hasAudioAlready = atPublishStage || (await client.hasText("Upload new file"));
    if (hasAudioAlready) {
      log("Skip audio upload: existing uploaded media detected.");
    } else {
      log("Upload episode audio");
      await uploadEpisodeAudio(client, audioFile);
    }

    let atMetadataStage = false;
    for (let i = 0; i < 15; i += 1) {
      const hasMetadataMarker =
        (await client.hasText("Title (required)")) ||
        (await client.hasText("Episode title")) ||
        (await client.hasText("Episode description")) ||
        ((await client.hasText("Upload new file")) && (await client.hasText("Next")));
      if (hasMetadataMarker) {
        atMetadataStage = true;
        break;
      }

      const hasPublishMarker = (await client.hasText("Publish")) || (await client.hasText("Schedule"));
      if (hasPublishMarker) {
        break;
      }

      await client.waitMs(2000);
    }
    if (atMetadataStage) {
      log("Fill episode title and description");
      await ensureMetadataRequiredFields(client, inputs, log);
    } else {
      log("Skip metadata fill: not on details step.");
    }

    // Final guard: never enter publish flow while required metadata fields are visible.
    await ensureMetadataRequiredFields(client, inputs, log);

    if (coverImage) {
      log("Upload episode cover image");
      await retry(3, async () => {
        await client.uploadBySemanticCandidates(ACTION_CANDIDATES.coverUpload, coverImage);
      });
    }

    if (inputs.publish_at) {
      log(`Configure schedule for ${inputs.publish_at}`);
    }
    await applyScheduleIfRequested(client, inputs.publish_at);

    log("Publish episode");
    await publishEpisode(client, confirmPublish);

    const publishedConfirmed = await verifyPublishedInList(
      client,
      inputs.title,
      inputs.show_home_url
    );
    if (!publishedConfirmed) {
      const foundInPublishedOnly = await verifyPublishedOnly(
        client,
        inputs.title,
        inputs.show_home_url
      );
      if (!foundInPublishedOnly) {
        throw new Error("Publish action completed but episode not found in Published list.");
      }
      throw new Error(
        "Episode appears in Published list but still exists in Draft list. Review publish-date required fields in wizard."
      );
    }

    const url = await client.getUrl();
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
    await client.close();
  }
}

export type { PublishEpisodeInputs, ExecutorContext } from "./core";

export default execute;
