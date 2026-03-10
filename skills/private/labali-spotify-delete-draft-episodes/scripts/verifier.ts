import { ACTION_CANDIDATES, AgentBrowserClient } from "./core";
import { ensureDraftFilter } from "./stage-detector";

const EMPTY_MARKERS = [
  "No episodes",
  "No draft episodes",
  "You don't have any draft episodes",
  "Nothing to show",
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function verifyDraftEmpty(client: AgentBrowserClient): Promise<boolean> {
  await ensureDraftFilter(client);
  await client.waitMs(1000);

  for (const marker of EMPTY_MARKERS) {
    if (await client.hasText(marker)) {
      return true;
    }
  }

  const snapshot = await client.snapshot();
  const refs = Object.values(snapshot.data?.refs ?? {});
  const hasRowActions = refs.some((ref) => {
    const role = normalize(ref.role ?? "");
    const name = normalize(ref.name ?? "");
    if (role !== "button") {
      return false;
    }
    return ACTION_CANDIDATES.rowAction.some((candidate) =>
      name.includes(normalize(candidate))
    );
  });

  return !hasRowActions;
}
