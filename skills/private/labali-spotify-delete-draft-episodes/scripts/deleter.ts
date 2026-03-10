import { ACTION_CANDIDATES, AgentBrowserClient } from "./core";
import { ensureDraftFilter } from "./stage-detector";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function hasNoDraftMarker(snapshotText: string): boolean {
  const markers = [
    "no episodes",
    "no draft episodes",
    "you don't have any draft episodes",
    "nothing to show",
  ];
  const lowered = snapshotText.toLowerCase();
  return markers.some((m) => lowered.includes(m));
}

async function countRowActionButtons(client: AgentBrowserClient): Promise<number> {
  const snapshot = await client.snapshot();
  const refs = Object.values(snapshot.data?.refs ?? {});
  return refs.filter((ref) => {
    const role = normalize(ref.role ?? "");
    const name = normalize(ref.name ?? "");
    if (role !== "button") {
      return false;
    }
    return ACTION_CANDIDATES.rowAction.some((candidate) =>
      name.includes(normalize(candidate))
    );
  }).length;
}

async function clickFirstButtonByNameContains(
  client: AgentBrowserClient,
  candidates: string[]
): Promise<boolean> {
  const result = await client.evalJs(`(() => {
    const candidates = ${JSON.stringify(candidates.map((c) => c.toLowerCase()))};
    const all = Array.from(document.getElementsByTagName("*"));
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    for (const node of all) {
      const role = ((node.getAttribute && node.getAttribute("role")) || "").toLowerCase();
      const tag = node.tagName.toLowerCase();
      const text = ((node.textContent || "").trim().toLowerCase());
      const aria = (((node.getAttribute && node.getAttribute("aria-label")) || "").trim().toLowerCase());
      const clickable = tag === "button" || role === "button" || role === "menuitem" || tag === "a";
      if (!clickable || !isVisible(node)) continue;
      if (candidates.some((c) => text.includes(c) || aria.includes(c))) {
        node.click();
        return "clicked";
      }
    }
    return "no-match";
  })()`);
  return result.includes("clicked");
}

async function tryOpenRowActions(client: AgentBrowserClient): Promise<boolean> {
  if (await clickFirstButtonByNameContains(client, ACTION_CANDIDATES.rowAction)) {
    return true;
  }

  try {
    await client.clickRoleByNames("button", ACTION_CANDIDATES.rowAction);
    return true;
  } catch {
    // Continue to fallback paths.
  }

  try {
    await client.clickTextByCandidates(ACTION_CANDIDATES.rowAction);
    return true;
  } catch {
    // Continue.
  }

  const snapshot = await client.snapshot();
  const refs = Object.entries(snapshot.data?.refs ?? {});
  for (const [refKey, ref] of refs) {
    const role = normalize(ref.role ?? "");
    const name = normalize(ref.name ?? "");
    if (role !== "button") {
      continue;
    }
    if (ACTION_CANDIDATES.rowAction.some((c) => name.includes(normalize(c)))) {
      if (await client.clickRef(refKey)) {
        return true;
      }
    }
  }

  return false;
}

async function deleteOneViaDomFallback(client: AgentBrowserClient): Promise<boolean> {
  const openedResult = await client.evalJs(`(() => {
    const all = Array.from(document.getElementsByTagName("*"));
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };

    const getText = (node) => ((node.textContent || "").trim().toLowerCase());
    const getAria = (node) => (((node.getAttribute && node.getAttribute("aria-label")) || "").trim().toLowerCase());

    const optionButtons = all.filter((node) => {
      const role = ((node.getAttribute && node.getAttribute("role")) || "").toLowerCase();
      const tag = node.tagName.toLowerCase();
      const text = getText(node);
      const aria = getAria(node);
      const clickable = tag === "button" || role === "button";
      return clickable && isVisible(node) && (text.includes("show options menu for") || aria.includes("show options menu for"));
    });

    if (optionButtons.length === 0) return "no-row";
    optionButtons[0].click();
    return "opened";
  })()`);

  if (!openedResult.includes("opened")) {
    return false;
  }

  await client.waitMs(600);

  let clickedDelete = await clickFirstButtonByNameContains(client, ACTION_CANDIDATES.deleteAction);
  if (!clickedDelete) {
    const deleteResult = await client.evalJs(`(() => {
      const all = Array.from(document.getElementsByTagName("*"));
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      for (const node of all) {
        const role = ((node.getAttribute && node.getAttribute("role")) || "").toLowerCase();
        const tag = node.tagName.toLowerCase();
        const text = ((node.textContent || "").trim().toLowerCase());
        const aria = (((node.getAttribute && node.getAttribute("aria-label")) || "").trim().toLowerCase());
        const clickable = tag === "button" || role === "button" || role === "menuitem" || tag === "a";
        if (!clickable || !isVisible(node)) continue;
        if (text === "delete" || text.includes("delete episode") || aria.includes("delete episode")) {
          node.click();
          return "delete-clicked";
        }
      }
      return "no-delete";
    })()`);
    clickedDelete = deleteResult.includes("delete-clicked");
  }

  if (!clickedDelete) {
    return false;
  }

  await client.waitMs(700);
  try {
    await client.clickRoleByNames("button", ACTION_CANDIDATES.deleteConfirm);
  } catch {
    try {
      await client.clickTextByCandidates(ACTION_CANDIDATES.deleteConfirm);
    } catch {
      const confirmResult = await client.evalJs(`(() => {
        const all = Array.from(document.getElementsByTagName("*"));
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        for (const node of all) {
          const role = ((node.getAttribute && node.getAttribute("role")) || "").toLowerCase();
          const tag = node.tagName.toLowerCase();
          const text = ((node.textContent || "").trim().toLowerCase());
          const aria = (((node.getAttribute && node.getAttribute("aria-label")) || "").trim().toLowerCase());
          const clickable = tag === "button" || role === "button";
          if (!clickable || !isVisible(node)) continue;
          if (
            text === "delete" ||
            text === "yes, delete" ||
            text.includes("yes, delete this episode") ||
            aria === "delete"
          ) {
            node.click();
            return "confirmed";
          }
        }
        return "no-confirm";
      })()`);
      if (!confirmResult.includes("confirmed")) {
        // Some variants do not require confirmation.
      }
    }
  }

  await client.waitMs(1600);
  return true;
}

async function tryDeleteFromMenu(client: AgentBrowserClient): Promise<boolean> {
  let clickedDelete = await clickFirstButtonByNameContains(client, ACTION_CANDIDATES.deleteAction);
  if (!clickedDelete) {
    try {
      await client.clickRoleByNames("menuitem", ACTION_CANDIDATES.deleteAction);
      clickedDelete = true;
    } catch {
      try {
        await client.clickRoleByNames("button", ACTION_CANDIDATES.deleteAction);
        clickedDelete = true;
      } catch {
        try {
          await client.clickTextByCandidates(ACTION_CANDIDATES.deleteAction);
          clickedDelete = true;
        } catch {
          clickedDelete = false;
        }
      }
    }
  }
  if (!clickedDelete) {
    return false;
  }

  await client.waitMs(900);
  const confirmedByRef = await clickFirstButtonByNameContains(client, ACTION_CANDIDATES.deleteConfirm);
  if (!confirmedByRef) {
    try {
      await client.clickRoleByNames("button", ACTION_CANDIDATES.deleteConfirm);
    } catch {
      try {
        await client.clickTextByCandidates(ACTION_CANDIDATES.deleteConfirm);
      } catch {
        // Some variants delete immediately without secondary confirmation dialog.
      }
    }
  }

  await client.waitMs(2200);
  return true;
}

export async function hasDraftRows(client: AgentBrowserClient): Promise<boolean> {
  const snapshot = await client.snapshot();
  const snapshotText = snapshot.data?.snapshot ?? "";

  if (hasNoDraftMarker(snapshotText)) {
    return false;
  }

  const refs = Object.values(snapshot.data?.refs ?? {});
  return refs.some((ref) => {
    const role = normalize(ref.role ?? "");
    const name = normalize(ref.name ?? "");
    if (role !== "button") {
      return false;
    }
    return ACTION_CANDIDATES.rowAction.some((candidate) =>
      name.includes(normalize(candidate))
    );
  });
}

export async function deleteOneDraftEpisode(client: AgentBrowserClient): Promise<boolean> {
  await ensureDraftFilter(client);
  if (!(await hasDraftRows(client))) {
    return false;
  }

  const opened = await tryOpenRowActions(client);
  if (!opened) {
    return deleteOneViaDomFallback(client);
  }

  const deleted = await tryDeleteFromMenu(client).catch(() => false);
  if (deleted) {
    return true;
  }
  return deleteOneViaDomFallback(client);
}

export async function deleteAllDraftEpisodes(
  client: AgentBrowserClient,
  maxDelete: number,
  log: (message: string) => void
): Promise<{ deleted: number; exhausted: boolean }> {
  let deleted = 0;

  while (deleted < maxDelete) {
    const success = await deleteOneDraftEpisode(client);
    if (!success) {
      const remaining = await hasDraftRows(client);
      return { deleted, exhausted: remaining };
    }
    deleted += 1;
    log(`Deleted draft episode count: ${deleted}`);
    await client.waitMs(1200);
    await ensureDraftFilter(client);
  }

  return { deleted, exhausted: await hasDraftRows(client) };
}
