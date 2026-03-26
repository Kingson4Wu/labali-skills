import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ACTION_CANDIDATES,
  AgentBrowserClient,
  DEFAULT_PROFILE_DIR,
  type DeleteDraftEpisodesInputs,
  type ExecutorContext,
  promptManualLogin,
  validateInputs,
  type LogFn,
} from "./core";
import {
  ensureDashboardOrShows,
  ensureLoginRoute,
  openShowDraftEpisodes,
} from "./stage-detector";
import { verifyDraftEmpty } from "./verifier";

async function clickByTextWithJs(client: AgentBrowserClient, names: string[]): Promise<boolean> {
  const result = await client.evalJs(`(() => {
    const names = ${JSON.stringify(names.map((n) => n.toLowerCase()))};
    const candidates = Array.from(document.querySelectorAll('button,[role="button"],[role="menuitem"],a'));
    const target = candidates.find((node) => {
      const text = (node.textContent || '').trim().toLowerCase();
      return names.some((name) => text.includes(name));
    });
    if (!target) return 'false';
    target.click();
    return 'true';
  })()`);
  return result.includes("true");
}

async function deleteOneDeterministic(client: AgentBrowserClient): Promise<boolean> {
  const openedActions = await clickByTextWithJs(client, ACTION_CANDIDATES.rowAction);
  if (!openedActions) {
    return false;
  }
  await client.waitMs(300);

  const clickedDelete = await clickByTextWithJs(client, ACTION_CANDIDATES.deleteAction);
  if (!clickedDelete) {
    return false;
  }
  await client.waitMs(300);

  const confirmed = await clickByTextWithJs(client, ACTION_CANDIDATES.deleteConfirm);
  if (!confirmed) {
    return false;
  }

  await client.waitMs(1200);
  return true;
}

export async function executeDeterministic(
  inputs: DeleteDraftEpisodesInputs,
  context: ExecutorContext = {}
): Promise<{ status: "draft-first-deleted" | "draft-cleaned"; show_id: string; deleted: number; url: string }> {
  validateInputs(inputs);
  const log: LogFn = context.logger ?? ((msg) => console.log(`[spotify-delete-draft-deterministic] ${msg}`));

  const profileDir = resolve(inputs.profile_dir ?? DEFAULT_PROFILE_DIR);
  const deleteAllDrafts = inputs.delete_all_drafts ?? false;
  const maxDelete = Number.parseInt(inputs.max_delete ?? "200", 10);
  const targetDeleteLimit = deleteAllDrafts ? maxDelete : 1;
  await mkdir(profileDir, { recursive: true });

  const client = await AgentBrowserClient.create(
    profileDir,
    inputs.headed ?? true,
    inputs.cdp_port,
    log,
    inputs.proxy_mode,
    inputs.proxy_server
  );

  try {
    await openShowDraftEpisodes(client, inputs.show_id.trim());
    await ensureLoginRoute(client);

    const loginState = await ensureDashboardOrShows(client);
    if (loginState !== "logged-in") {
      log("Manual login required. Complete login in the opened browser window.");
      await promptManualLogin("Sign in to Spotify for Creators manually.", context.prompt);
      await client.waitForTextAny(ACTION_CANDIDATES.dashboardMarkers, 120000);
      await openShowDraftEpisodes(client, inputs.show_id.trim());
    }

    let deleted = 0;
    for (let i = 0; i < targetDeleteLimit; i += 1) {
      const success = await deleteOneDeterministic(client);
      if (!success) {
        break;
      }
      deleted += 1;
      log(`Deterministic deleted count: ${deleted}`);
    }

    if (!deleteAllDrafts) {
      if (deleted < 1) {
        throw new Error("Deterministic mode failed to delete the first Draft episode.");
      }
      return {
        status: "draft-first-deleted",
        show_id: inputs.show_id.trim(),
        deleted,
        url: await client.getUrl(),
      };
    }

    const verified = await verifyDraftEmpty(client);
    if (!verified) {
      throw new Error("Deterministic delete completed but Draft list is not empty.");
    }

    return {
      status: "draft-cleaned",
      show_id: inputs.show_id.trim(),
      deleted,
      url: await client.getUrl(),
    };
  } finally {
    await client.close();
  }
}

export default executeDeterministic;
