import {
  ACTION_CANDIDATES,
  AgentBrowserClient,
  retry,
} from "./core";

export function isCreatorsUrl(url: string): boolean {
  return /^https:\/\/creators\.spotify\.com\//i.test(url);
}

export function isEpisodeWizardUrl(url: string): boolean {
  return /\/episode\/(?:[^/]+\/)?wizard/i.test(url);
}

export function extractShowId(url: string): string | undefined {
  const match = url.match(/\/pod\/show\/([^/]+)/i);
  return match?.[1];
}

export function isSameShowByUrl(currentUrl: string, targetShowUrl?: string): boolean {
  if (!targetShowUrl) {
    return false;
  }
  const currentId = extractShowId(currentUrl);
  const targetId = extractShowId(targetShowUrl);
  return Boolean(currentId && targetId && currentId === targetId);
}

export async function ensureDashboardOrShows(
  client: AgentBrowserClient
): Promise<"logged-in" | "logged-out" | "unknown"> {
  const snapshot = await client.snapshot();
  const snapshotText = (snapshot.data?.snapshot ?? "").toLowerCase();

  const hasDashboardMarker = ACTION_CANDIDATES.dashboardMarkers.some((marker) =>
    snapshotText.includes(marker.toLowerCase())
  );
  const hasLoginMarker = ACTION_CANDIDATES.loginMarkers.some((marker) =>
    snapshotText.includes(marker.toLowerCase())
  );

  if (hasDashboardMarker) {
    return "logged-in";
  }
  if (hasLoginMarker) {
    return "logged-out";
  }
  return "unknown";
}

export async function ensureLoginRoute(client: AgentBrowserClient): Promise<void> {
  const state = await ensureDashboardOrShows(client);
  if (state === "logged-out") {
    await retry(3, async () => {
      try {
        await client.clickRoleByNames("link", ["Log in", "Login"]);
      } catch {
        await client.clickTextByCandidates(["Log in", "Login", "Get started"]);
      }
    });
    await client.waitForLoad();
  }
}

export async function selectShow(client: AgentBrowserClient, showName: string): Promise<void> {
  await retry(4, async () => {
    try {
      await client.clickRoleByNames("link", [showName]);
      return;
    } catch {
      // fall through
    }

    try {
      await client.clickRoleByNames("button", [showName]);
      return;
    } catch {
      // fall through
    }

    await client.clickTextByCandidates([showName]);
  });
}

export async function openEpisodeCreator(client: AgentBrowserClient): Promise<void> {
  await retry(4, async () => {
    try {
      await client.clickRoleByNames("button", ACTION_CANDIDATES.createEpisode);
      return;
    } catch {
      // fall through
    }

    try {
      await client.clickRoleByNames("link", ACTION_CANDIDATES.createEpisode);
      return;
    } catch {
      await client.clickTextByCandidates(ACTION_CANDIDATES.createEpisode);
    }
  });
}

export async function isEpisodeCreatorVisible(client: AgentBrowserClient): Promise<boolean> {
  for (const candidate of ACTION_CANDIDATES.createEpisode) {
    if (await client.hasText(candidate)) {
      return true;
    }
  }
  return false;
}

export async function isUploadSurfaceVisible(client: AgentBrowserClient): Promise<boolean> {
  const currentUrl = await client.getUrl();
  if (isEpisodeWizardUrl(currentUrl)) {
    return true;
  }

  const uploadHints = [
    "Upload audio",
    "Episode file",
    "Audio file",
    "Select file",
    "Choose file",
    "Browse files",
    "Add audio",
    "Drag and drop",
    "Upload new file",
  ];
  for (const hint of [...ACTION_CANDIDATES.audioUpload, ...uploadHints]) {
    if (await client.hasText(hint)) {
      return true;
    }
  }
  return false;
}

export async function ensureUploadFlowReady(client: AgentBrowserClient): Promise<void> {
  if (await isUploadSurfaceVisible(client)) {
    return;
  }

  const recoveryNavCandidates = ["audio", "Audio", "Episodes", "Episode"];
  for (const candidate of recoveryNavCandidates) {
    try {
      await client.clickRoleByNames("link", [candidate]);
      await client.waitForLoad();
      break;
    } catch {
      try {
        await client.clickTextByCandidates([candidate]);
        await client.waitForLoad();
        break;
      } catch {
        // continue
      }
    }
  }

  if (await isUploadSurfaceVisible(client)) {
    return;
  }

  await openEpisodeCreator(client);
  await client.waitForLoad();
}

export async function uploadEpisodeAudio(client: AgentBrowserClient, audioFile: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await ensureUploadFlowReady(client);
      await client.uploadBySemanticCandidates(ACTION_CANDIDATES.audioUpload, audioFile);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
