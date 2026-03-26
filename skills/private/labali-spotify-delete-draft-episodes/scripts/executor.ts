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
import { deleteAllDraftEpisodes } from "./deleter";
import {
  ensureDashboardOrShows,
  ensureDraftFilter,
  ensureLoginRoute,
  openShowDraftEpisodes,
} from "./stage-detector";
import { verifyDraftEmpty } from "./verifier";

export async function execute(
  inputs: DeleteDraftEpisodesInputs,
  context: ExecutorContext = {}
): Promise<{ status: "draft-first-deleted" | "draft-cleaned"; show_id: string; deleted: number; url: string }> {
  validateInputs(inputs);

  const log: LogFn = context.logger ?? ((msg) => console.log(`[spotify-delete-draft-policy] ${msg}`));
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
    log("entry: open show draft episodes page");
    await openShowDraftEpisodes(client, inputs.show_id.trim());
    await ensureLoginRoute(client);

    const loginState = await ensureDashboardOrShows(client);
    if (loginState !== "logged-in") {
      log("Manual login required. Complete login in the opened browser window.");
      await promptManualLogin("Sign in to Spotify for Creators manually.", context.prompt);
      await client.waitForTextAny(ACTION_CANDIDATES.dashboardMarkers, 120000);
      await openShowDraftEpisodes(client, inputs.show_id.trim());
    }

    log("draft-filter: ensure Draft filter active");
    await ensureDraftFilter(client);

    log(
      `delete-loop: mode=${deleteAllDrafts ? "delete-all" : "delete-first"} safety_cap=${maxDelete} target_limit=${targetDeleteLimit}`
    );
    const loopResult = await deleteAllDraftEpisodes(client, targetDeleteLimit, log);

    if (!deleteAllDrafts) {
      if (loopResult.deleted < 1) {
        throw new Error("No Draft episode was deleted. Confirm at least one Draft item exists.");
      }
      return {
        status: "draft-first-deleted",
        show_id: inputs.show_id.trim(),
        deleted: loopResult.deleted,
        url: await client.getUrl(),
      };
    }

    if (loopResult.exhausted) {
      throw new Error(
        `Delete-all loop hit unresolved draft entries after deleting ${loopResult.deleted}. Increase max_delete or inspect UI drift.`
      );
    }

    log("verify: final draft-empty verification");
    const verified = await verifyDraftEmpty(client);
    if (!verified) {
      throw new Error("Verification failed: Draft list is not empty after delete loop.");
    }

    return {
      status: "draft-cleaned",
      show_id: inputs.show_id.trim(),
      deleted: loopResult.deleted,
      url: await client.getUrl(),
    };
  } catch (error) {
    const snapshotPath = resolve(`spotify-delete-draft-failure-${Date.now()}.png`);
    await client.screenshot(snapshotPath);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}. Screenshot: ${snapshotPath}`);
  } finally {
    await client.close();
  }
}

export default execute;
