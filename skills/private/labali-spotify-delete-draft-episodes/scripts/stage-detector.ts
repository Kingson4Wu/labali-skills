import {
  ACTION_CANDIDATES,
  AgentBrowserClient,
  retry,
  SPOTIFY_CREATORS_URL,
} from "./core";

export function isCreatorsUrl(url: string): boolean {
  return /^https:\/\/creators\.spotify\.com\//i.test(url);
}

export function extractShowId(url: string): string | undefined {
  const match = url.match(/\/pod\/show\/([^/]+)/i);
  return match?.[1];
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

export async function openShowDraftEpisodes(client: AgentBrowserClient, showId: string): Promise<string> {
  const draftUrl = `${SPOTIFY_CREATORS_URL}/pod/show/${showId}/episodes?filter=DRAFT_EPISODES&currentPage=1`;
  await client.open(draftUrl);
  await client.waitMs(2000);
  return draftUrl;
}

export async function ensureDraftFilter(client: AgentBrowserClient): Promise<void> {
  await retry(4, async () => {
    try {
      await client.clickRoleByNames("radio", ACTION_CANDIDATES.draftFilter);
    } catch {
      await client.clickTextByCandidates(ACTION_CANDIDATES.draftFilter);
    }
  });
  await client.waitMs(800);
}
