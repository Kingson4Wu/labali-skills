import {
  AgentBrowserClient,
  SEARCH_EPISODES_PLACEHOLDER,
  SPOTIFY_CREATORS_URL,
} from "./core";
import { extractShowId } from "./stage-detector";

export async function verifyPublishedInList(
  client: AgentBrowserClient,
  title: string,
  showHomeUrl?: string
): Promise<boolean> {
  const showId = extractShowId(showHomeUrl ?? "");
  const episodesUrl = showId
    ? `https://creators.spotify.com/pod/show/${showId}/episodes`
    : `${SPOTIFY_CREATORS_URL}/episodes`;

  const searchInFilter = async (filterName: "Published" | "Draft"): Promise<boolean> => {
    await client.open(episodesUrl);
    await client.waitMs(2000);
    try {
      await client.clickRoleByNames("radio", [filterName]);
    } catch {
      await client.clickTextByCandidates([filterName]);
    }
    await client.waitMs(800);
    try {
      await client.fillByPlaceholderCandidates([SEARCH_EPISODES_PLACEHOLDER], title);
      await client.waitMs(400);
      try {
        await client.clickRoleByNames("button", ["Search"]);
      } catch {
        // Search button can be optional if filtering is instant.
      }
      await client.waitMs(1200);
    } catch {
      // Keep best-effort behavior; fall back to visible-list check below.
    }
    return client.hasText(title);
  };

  const foundInPublished = await searchInFilter("Published");
  const foundInDraft = await searchInFilter("Draft");
  return foundInPublished && !foundInDraft;
}

export async function verifyPublishedOnly(
  client: AgentBrowserClient,
  title: string,
  showHomeUrl?: string
): Promise<boolean> {
  const showId = extractShowId(showHomeUrl ?? "");
  const episodesUrl = showId
    ? `https://creators.spotify.com/pod/show/${showId}/episodes`
    : `${SPOTIFY_CREATORS_URL}/episodes`;

  await client.open(episodesUrl);
  await client.waitMs(2000);
  try {
    await client.clickRoleByNames("radio", ["Published"]);
  } catch {
    await client.clickTextByCandidates(["Published"]);
  }
  await client.waitMs(800);
  try {
    await client.fillByPlaceholderCandidates([SEARCH_EPISODES_PLACEHOLDER], title);
    await client.waitMs(400);
    try {
      await client.clickRoleByNames("button", ["Search"]);
    } catch {
      // Search button can be optional if filtering is instant.
    }
    await client.waitMs(1200);
  } catch {
    // Keep best-effort behavior; fall back to visible-list check below.
  }
  return client.hasText(title);
}
