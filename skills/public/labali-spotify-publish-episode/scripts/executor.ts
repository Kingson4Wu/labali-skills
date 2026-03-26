import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

  // Normalize line endings to Windows-style \r\n for better rich text editor compatibility
  const normalizedDescription = inputs.description.replace(/\r?\n/g, '\r\n');

  await retry(2, async () => {
    const nativeDescriptionFilled = await nativeTypeByPredicate(
      client,
      (name, role) =>
        role === "textbox" &&
        !name.includes("title") &&
        !name.includes("shortcut") &&
        !name.includes("search"),
      normalizedDescription
    );
    if (nativeDescriptionFilled) {
      return;
    }

    // Convert \r\n to <br> and use innerHTML for rich text editor
    // HTML-escape the description first, then convert line breaks to <br>
    const htmlEscaped = normalizedDescription
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const htmlDescription = htmlEscaped
      .replace(/\r\n\r\n/g, '<br><br>')
      .replace(/\r\n/g, '<br>');

    await client.evalJs(`(() => {
      const targets = Array.from(document.querySelectorAll('[contenteditable="true"]'))
        .filter((node) => {
          const role = (node.getAttribute("role") || "").toLowerCase();
          const name = (node.getAttribute("name") || "").toLowerCase();
          return role === "textbox" && name.includes("description");
        });

      if (targets.length === 0) return 'no-target';

      const target = targets[0];
      target.focus();
      // Directly assign HTML string (already escaped and with <br> tags)
      target.innerHTML = ${JSON.stringify(htmlDescription)};
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      target.dispatchEvent(new Event("blur", { bubbles: true }));

      return 'done';
    })()`);
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
      node.textContent = ${JSON.stringify(normalizedDescription)};
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

async function ensureProvidedSeasonEpisodeApplied(
  client: AgentBrowserClient,
  seasonNumber?: string,
  episodeNumber?: string
): Promise<void> {
  const season = seasonNumber?.trim();
  const episode = episodeNumber?.trim();
  if (!season && !episode) {
    return;
  }

  const readValues = async (): Promise<{ season?: string; episode?: string }> => {
    const raw = await client.evalJs(`(() => {
      const inputs = Array.from(document.getElementsByTagName('input'));
      const seasonInput = inputs.find((i) => (i.name || '') === 'podcastSeasonNumber');
      const episodeInput = inputs.find((i) => (i.name || '') === 'podcastEpisodeNumber');
      return JSON.stringify({
        season: seasonInput ? (seasonInput.value || '').trim() : undefined,
        episode: episodeInput ? (episodeInput.value || '').trim() : undefined,
      });
    })()`);
    const parsed = JSON.parse(raw || "{}") as unknown;
    return (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as {
      season?: string;
      episode?: string;
    };
  };

  const matches = (vals: { season?: string; episode?: string }): boolean => {
    const seasonOk = !season || vals.season === season;
    const episodeOk = !episode || vals.episode === episode;
    return seasonOk && episodeOk;
  };

  let values = await readValues();
  if (matches(values)) {
    return;
  }

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
    const inputs = Array.from(document.getElementsByTagName('input'));
    const seasonInput = inputs.find((i) => (i.name || '') === 'podcastSeasonNumber');
    const episodeInput = inputs.find((i) => (i.name || '') === 'podcastEpisodeNumber');
    if (seasonInput && ${JSON.stringify(season ?? "")}) setInputValue(seasonInput, ${JSON.stringify(season ?? "")});
    if (episodeInput && ${JSON.stringify(episode ?? "")}) setInputValue(episodeInput, ${JSON.stringify(episode ?? "")});
    return "ok";
  })()`);

  values = await readValues();
  if (!matches(values)) {
    throw new Error(
      `Provided season/episode not applied. expected season='${season ?? ""}', episode='${episode ?? ""}', got season='${values.season ?? ""}', episode='${values.episode ?? ""}'`
    );
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
  await ensureProvidedSeasonEpisodeApplied(client, inputs.season_number, inputs.episode_number);
}

export async function execute(inputs: PublishEpisodeInputs, context: ExecutorContext = {}): Promise<{
  status: "published" | "scheduled";
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

  const client = await AgentBrowserClient.create(
    profileDir,
    inputs.headed ?? true,
    inputs.cdp_port,
    log,
    inputs.proxy_mode,
    inputs.proxy_server
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
    const targetShowUrl = inputs.show_home_url;
    const targetUrl = targetShowUrl ?? SPOTIFY_CREATORS_URL;
    await timed("entry", async () => {
      const currentUrl = await client.getUrl();
      const inEpisodeWizardContext = /\/episode\/[^/]+\/wizard/i.test(currentUrl);
      if (isCreatorsUrl(currentUrl) && !(inEpisodeWizardContext && targetShowUrl)) {
        log(`Reuse already opened page: ${currentUrl}`);
      } else {
        if (inEpisodeWizardContext && targetShowUrl) {
          log(`Reset from episode wizard context to show home: ${targetShowUrl}`);
        } else {
          log(`Open ${targetUrl}`);
        }
        await client.open(targetUrl);
      }
      await ensureLoginRoute(client);
    });

    const loginState = await timed("login-state-check", async () => ensureDashboardOrShows(client));
    if (loginState === "logged-out") {
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
    const showNameVisibleMatch = inputs.show_name
      ? (await client.hasText(inputs.show_name)) && (await isEpisodeCreatorVisible(client))
      : false;
    const alreadyInTargetShow =
      isSameShowByUrl(postLoginUrl, targetShowUrl) || showNameVisibleMatch;

    if (alreadyInTargetShow) {
      log(`Target show already open: ${postLoginUrl}`);
    } else {
      if (targetShowUrl) {
        await timed("show-selection", async () => {
          log(`Open target show URL: ${targetShowUrl}`);
          await client.open(targetShowUrl);
          await client.waitForLoad();
        });
      } else if (inputs.show_name) {
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
      } else {
        throw new Error("Cannot resolve target show. Provide show_id, show_home_url, or show_name.");
      }
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
      await publishEpisode(
        client,
        confirmPublish,
        shouldVerifyAsScheduled(inputs.publish_at) ? "schedule" : "publish"
      );
    });

    if (shouldVerifyAsScheduled(inputs.publish_at)) {
      const scheduledConfirmed = await timed("verify-scheduled", async () =>
        verifyScheduledInList(client, inputs.title, targetShowUrl)
      );
      if (!scheduledConfirmed) {
        throw new Error("Schedule action completed but episode not found in Scheduled list.");
      }
    } else {
      const publishedConfirmed = await timed("verify-published", async () =>
        verifyPublishedInList(
          client,
          inputs.title,
          targetShowUrl
        )
      );
      if (!publishedConfirmed) {
        const foundInPublishedOnly = await timed("verify-published-only", async () =>
          verifyPublishedOnly(
            client,
            inputs.title,
            targetShowUrl
          )
        );
        if (!foundInPublishedOnly) {
          throw new Error("Publish action completed but episode not found in Published list.");
        }
        throw new Error(
          "Episode appears in Published list but still exists in Draft list. Review publish-date required fields in wizard."
        );
      }
    }

    await timed("draft-cleanup", async () => {
      const deleted = await deleteDraftEpisodes(
        client,
        [inputs.title, "Untitled"],
        targetShowUrl
      );
      log(`Deleted draft leftovers: ${deleted}`);
    });

    const url = await client.getUrl();
    const totalMs = Date.now() - runStartedAt;
    const sorted = Object.entries(stepDurations).sort((a, b) => b[1] - a[1]);
    const topSteps = sorted.slice(0, 6).map(([name, ms]) => `${name}=${(ms / 1000).toFixed(1)}s`);
    log(`[timing] total: ${(totalMs / 1000).toFixed(1)}s`);
    log(`[timing] top-steps: ${topSteps.join(", ")}`);

    const publishMode = shouldVerifyAsScheduled(inputs.publish_at) ? "scheduled" : "immediate";
    const finalSnapshot = await client.snapshot();
    const finalRefs = finalSnapshot.data?.refs ?? {};
    const titleRef = Object.values(finalRefs).find((r) => (r.role ?? "") === "textbox" && (r.name ?? "").toLowerCase().includes("title"));
    const descRef = Object.values(finalRefs).find((r) => (r.role ?? "") === "textbox" && !(r.name ?? "").toLowerCase().includes("title") && !(r.name ?? "").toLowerCase().includes("search"));
    const trajectory = {
      timestamp: new Date().toISOString(),
      ...(inputs.show_id ? { show_id: inputs.show_id } : inputs.show_name ? { show_name: inputs.show_name } : { show_home_url: inputs.show_home_url }),
      stages: Object.keys(stepDurations).map((stage) => ({ stage, duration_ms: stepDurations[stage] })),
      refs_snapshot: {
        title_ref_role: titleRef?.role ?? "textbox",
        title_ref_name: titleRef?.name ?? "Title",
        description_ref_role: descRef?.role ?? "textbox",
        description_ref_name: descRef?.name ?? "",
      },
      fallbacks_used: [],
      publish_mode: publishMode,
    };
    try {
      const cacheDir = resolve(skillRoot, ".cache/spotify-publish");
      await mkdir(cacheDir, { recursive: true });
      await writeFile(resolve(cacheDir, "policy-trajectory-latest.json"), JSON.stringify(trajectory, null, 2), "utf8");
    } catch {
      // Non-fatal: trajectory logging must not block the successful result
    }

    return {
      status: publishMode === "scheduled" ? "scheduled" : "published",
      show: inputs.show_name ?? inputs.show_id ?? "unknown-show",
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
