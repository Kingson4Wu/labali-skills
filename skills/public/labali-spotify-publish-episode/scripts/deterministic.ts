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
import { waitForPreviewReady } from "./publisher";
import { ensureDashboardOrShows, ensureLoginRoute } from "./stage-detector";
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

async function fillDeterministicMetadata(
  client: AgentBrowserClient,
  inputs: PublishEpisodeInputs
): Promise<void> {
  const season = inputs.season_number?.trim() ?? "";
  const episode = inputs.episode_number?.trim() ?? "";
  const title = JSON.stringify(inputs.title);
  const description = JSON.stringify(inputs.description);
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
        descriptionNative = await nativeTypeRef(client, refKey, inputs.description);
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
      editor.textContent = ${description};
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const seasonInput = document.querySelector('input[name="podcastSeasonNumber"]');
    if (seasonInput && ${seasonJs}) {
      setInputValue(seasonInput, ${seasonJs});
    }

    const episodeInput = document.querySelector('input[name="podcastEpisodeNumber"]');
    if (episodeInput && ${episodeJs}) {
      setInputValue(episodeInput, ${episodeJs});
    }
    return "ok";
  })()`);

  // Verify critical fields were applied; deterministic path should fail fast if not.
  const verified = await client.evalJs(`(() => {
    const titleInput = document.querySelector('input[name="title"]');
    const seasonInput = document.querySelector('input[name="podcastSeasonNumber"]');
    const episodeInput = document.querySelector('input[name="podcastEpisodeNumber"]');
    const descriptionNode = Array.from(document.querySelectorAll('[contenteditable="true"]'))
      .find((node) => node && node.offsetParent !== null);
    const titleOk = !!titleInput && (titleInput.value || '').trim().length > 0;
    const descOk = !!descriptionNode && (descriptionNode.textContent || '').trim().length > 0;
    const seasonOk = !${seasonJs} || (!!seasonInput && (seasonInput.value || '').trim() === ${seasonJs});
    const episodeOk = !${episodeJs} || (!!episodeInput && (episodeInput.value || '').trim() === ${episodeJs});
    return JSON.stringify({ titleOk, descOk, seasonOk, episodeOk });
  })()`);
  const parsed = JSON.parse(verified || "{}") as unknown;
  const result = (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as {
    titleOk?: boolean;
    descOk?: boolean;
    seasonOk?: boolean;
    episodeOk?: boolean;
  };
  if (!result.titleOk || !result.descOk || !result.seasonOk || !result.episodeOk) {
    throw new Error(
      `Deterministic metadata verify failed: ${JSON.stringify(result)}`
    );
  }

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

async function advanceDeterministicToPublish(client: AgentBrowserClient): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    const hasPublish = await client.waitForTextAny(
      ["Publish", "Publish episode", "Save and publish"],
      1500
    );
    if (hasPublish) {
      return;
    }

    const nextReady = await waitNextReady(client);
    if (!nextReady) {
      await client.waitMs(3000);
      continue;
    }

    await client.clickRoleByNames("button", ["Next", "Continue", "Review"]);
    await client.waitMs(2500);
  }

  throw new Error("Deterministic flow did not reach publish step after bounded Next attempts.");
}

export async function executeDeterministic(
  inputs: PublishEpisodeInputs,
  context: ExecutorContext = {}
): Promise<{ status: "published"; show: string; url: string }> {
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

    log(`Open deterministic entry: ${episodesPage}`);
    await client.open(episodesPage);
    await ensureLoginRoute(client);

    const loginState = await ensureDashboardOrShows(client);
    if (loginState !== "logged-in") {
      log("Manual login required. Complete login in the opened browser window.");
      await promptManualLogin("Sign in to Spotify for Creators manually.", context.prompt);
      await client.waitForTextAny(ACTION_CANDIDATES.dashboardMarkers, 120000);
    }

    log("Click New episode");
    try {
      await client.clickRoleByNames("link", ["New episode"]);
    } catch {
      await client.clickRoleByNames("link", ["Create a new episode"]);
    }
    await client.waitMs(4000);

    log("Upload audio");
    await client.uploadBySemanticCandidates(ACTION_CANDIDATES.audioUpload, audioFile);
    await client.waitMs(5000);

    log("Fill deterministic metadata");
    await fillDeterministicMetadata(client, inputs);
    await client.waitMs(1500);

    log("Next to publish step");
    await advanceDeterministicToPublish(client);

    log("Select Now and Publish");
    try {
      await client.clickRoleByNames("radio", ["Now"]);
    } catch {
      await client.evalJs(
        "(() => { const label = document.querySelector('label[for=\"publish-date-now\"]'); if (label) label.click(); const input = document.getElementById('publish-date-now'); if (input) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); } return 'ok'; })()"
      );
    }
    log("Wait for upload preview to be ready before publish");
    await waitForPreviewReady(client);
    await client.clickRoleByNames("button", ["Publish", "Publish episode", "Save and publish"]);
    await client.waitMs(3000);

    const publishedConfirmed = await verifyPublishedInList(client, inputs.title, inputs.show_home_url);
    if (!publishedConfirmed) {
      const foundInPublishedOnly = await verifyPublishedOnly(client, inputs.title, inputs.show_home_url);
      if (!foundInPublishedOnly) {
        throw new Error("Deterministic publish completed but episode not found in Published.");
      }
      throw new Error("Deterministic publish found title in Published and Draft simultaneously.");
    }

    return {
      status: "published",
      show: inputs.show_name ?? inputs.show_id ?? "unknown-show",
      url: await client.getUrl(),
    };
  } finally {
    await client.close();
  }
}

export default executeDeterministic;
