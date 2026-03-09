import {
  ACTION_CANDIDATES,
  AgentBrowserClient,
  retry,
} from "./core";

export async function applyScheduleIfRequested(
  client: AgentBrowserClient,
  publishAt?: string
): Promise<void> {
  if (!publishAt) {
    return;
  }

  const date = new Date(publishAt);
  const dateValue = date.toISOString().slice(0, 10);
  const timeValue = date.toISOString().slice(11, 16);

  await retry(3, async () => {
    try {
      await client.clickRoleByNames("button", ACTION_CANDIDATES.schedule);
    } catch {
      await client.clickTextByCandidates(ACTION_CANDIDATES.schedule);
    }
  });

  await retry(3, async () => {
    await client.fillByLabelCandidates(["Date", "Publish date", "Release date"], dateValue);
  });

  await retry(3, async () => {
    await client.fillByLabelCandidates(["Time", "Publish time", "Release time"], timeValue);
  });
}

export async function publishEpisode(client: AgentBrowserClient, confirmPublish: boolean): Promise<void> {
  if (!confirmPublish) {
    throw new Error("Final publish blocked. Set confirm_publish=true to allow publishing.");
  }

  const hasPublishAction = async (): Promise<boolean> => {
    for (const candidate of ACTION_CANDIDATES.publish) {
      if (await client.hasText(candidate)) {
        return true;
      }
    }
    return false;
  };

  const stepForwardCandidates = ["Next", "Continue", "Review", "Save and continue"];

  for (let i = 0; i < 6; i += 1) {
    if (await hasPublishAction()) {
      break;
    }
    const hasStepForward = await client.waitForTextAny(stepForwardCandidates, 4000);
    if (hasStepForward) {
      try {
        await client.clickRoleByNames("button", stepForwardCandidates);
      } catch {
        await client.clickTextByCandidates(stepForwardCandidates);
      }
      await client.waitForLoad();
      await client.waitForTextAny([...ACTION_CANDIDATES.publish, ...stepForwardCandidates], 20000);
      continue;
    }
    break;
  }

  await client.waitForTextAny(ACTION_CANDIDATES.publish, 30000);

  // Some Spotify layouts do not preselect "Now"; always set it when visible.
  if (await client.hasText("Now")) {
    await client.evalJs(
      "(() => { const labels = Array.from(document.getElementsByTagName('label')); const label = labels.find((x) => x.htmlFor === 'publish-date-now'); if (label) { label.click(); return 'clicked-label'; } const input = document.getElementById('publish-date-now'); if (input) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); return 'checked-input'; } return 'no-now-control'; })()"
    );
    try {
      await client.clickRoleByNames("radio", ["Now"]);
    } catch {
      // Best effort only; evalJs attempt above may already satisfy this requirement.
    }
  }

  await retry(3, async () => {
    try {
      await client.clickRoleByNames("button", ACTION_CANDIDATES.publish);
    } catch {
      await client.clickTextByCandidates(ACTION_CANDIDATES.publish);
    }
  });

  const optionalConfirmCandidates = ["Publish now", "Confirm publish"];
  const hasOptionalConfirm = await client.waitForTextAny(optionalConfirmCandidates, 5000);
  if (hasOptionalConfirm) {
    await retry(2, async () => {
      try {
        await client.clickRoleByNames("button", optionalConfirmCandidates);
      } catch {
        await client.clickTextByCandidates(optionalConfirmCandidates);
      }
    });
  }
}
