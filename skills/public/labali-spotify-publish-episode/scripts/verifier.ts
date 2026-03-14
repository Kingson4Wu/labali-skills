import {
  AgentBrowserClient,
  SEARCH_EPISODES_PLACEHOLDER,
  SPOTIFY_CREATORS_URL,
} from "./core";
import { extractShowId } from "./stage-detector";

function episodesUrlFor(showHomeUrl?: string): string {
  const showId = extractShowId(showHomeUrl ?? "");
  return showId
    ? `https://creators.spotify.com/pod/show/${showId}/episodes`
    : `${SPOTIFY_CREATORS_URL}/episodes`;
}

export function shouldVerifyAsScheduled(publishAt?: string): boolean {
  if (!publishAt) {
    return false;
  }
  const publishDate = new Date(publishAt);
  return Number.isFinite(publishDate.getTime()) && publishDate.getTime() > Date.now();
}

export async function verifyPublishedInList(
  client: AgentBrowserClient,
  title: string,
  showHomeUrl?: string
): Promise<boolean> {
  const episodesUrl = episodesUrlFor(showHomeUrl);

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
  const episodesUrl = episodesUrlFor(showHomeUrl);

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

export async function verifyScheduledInList(
  client: AgentBrowserClient,
  title: string,
  showHomeUrl?: string
): Promise<boolean> {
  const episodesUrl = episodesUrlFor(showHomeUrl);

  const searchInFilter = async (filterName: "Scheduled" | "Draft"): Promise<boolean> => {
    await client.open(episodesUrl);
    await client.waitMs(2000);
    try {
      await client.clickRoleByNames("radio", [filterName]);
    } catch {
      await client.clickTextByCandidates([filterName]);
    }
    await client.waitMs(1500);
    try {
      await client.fillByPlaceholderCandidates([SEARCH_EPISODES_PLACEHOLDER], title);
      await client.waitMs(500);
      try {
        await client.clickRoleByNames("button", ["Search"]);
      } catch {
        // Search button can be optional if filtering is instant.
      }
      await client.waitMs(1500);
    } catch {
      // Keep best-effort behavior; fall back to visible-list check below.
    }
    return client.hasText(title);
  };

  const foundInScheduled = await searchInFilter("Scheduled");
  console.log('[verifier] Found in Scheduled:', foundInScheduled, 'title:', title);
  
  // If found in Scheduled, consider it successful. Draft cleanup will happen in a separate step.
  if (foundInScheduled) {
    return true;
  }
  
  return false;
}

async function searchDrafts(client: AgentBrowserClient, title: string, showHomeUrl?: string): Promise<void> {
  const episodesUrl = episodesUrlFor(showHomeUrl);
  await client.open(episodesUrl);
  await client.waitMs(1500);
  try {
    await client.clickRoleByNames("radio", ["Draft"]);
  } catch {
    await client.clickTextByCandidates(["Draft"]);
  }
  await client.waitMs(800);
  try {
    await client.fillByPlaceholderCandidates([SEARCH_EPISODES_PLACEHOLDER], title);
    await client.waitMs(400);
  } catch {
    // Search can be absent; continue with visible list.
  }
}

export async function deleteDraftEpisodes(
  client: AgentBrowserClient,
  titles: string[],
  showHomeUrl?: string
): Promise<number> {
  let deleted = 0;

  for (const rawTitle of titles) {
    const title = rawTitle.trim();
    if (!title) {
      continue;
    }

    for (let i = 0; i < 10; i += 1) {
      await searchDrafts(client, title, showHomeUrl);
      const found = await client.hasText(title);
      if (!found) {
        break;
      }

      const escapedTitle = JSON.stringify(title);
      const deleteResult = await client.evalJs(`(() => {
        const normalize = (s) => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const target = normalize(${escapedTitle});
        const menuButtons = Array.from(document.querySelectorAll('button[aria-label^="Show options menu for "]'));
        const button = menuButtons.find((btn) => {
          const row = btn.closest('tr') || btn.parentElement?.parentElement?.parentElement || btn.parentElement;
          const rowText = normalize(row ? row.textContent : '');
          return rowText.includes('draft') && rowText.includes(target);
        });
        if (!button) return 'missing-menu';
        button.click();
        return 'menu-opened';
      })()`);
      if (!deleteResult.includes("menu-opened")) {
        break;
      }

      await client.waitMs(400);
      try {
        await client.clickTextByCandidates(["Delete episode"]);
      } catch {
        break;
      }
      await client.waitMs(400);
      try {
        await client.clickTextByCandidates(["Yes, delete this episode"]);
      } catch {
        break;
      }
      await client.waitMs(1200);
      deleted += 1;
    }
  }

  return deleted;
}
