import {
  ACTION_CANDIDATES,
  AgentBrowserClient,
  retry,
} from "./core";

const PREVIEW_READY_MARKERS = ["Preview ready!", "Preview ready"];
const UPLOAD_PENDING_MARKERS = [
  "Uploading",
  "Upload in progress",
  "Processing",
  "Transcoding",
  "Generating preview",
  "Preparing preview",
];

async function isPublishButtonEnabled(client: AgentBrowserClient): Promise<boolean> {
  const out = await client.evalJs(`(() => {
    const normalize = (s) => (s || '').trim().toLowerCase();
    const candidates = ${JSON.stringify(ACTION_CANDIDATES.publish.map((x) => x.toLowerCase()))};
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((button) => {
      const text = normalize(button.textContent);
      return candidates.some((candidate) => text === candidate || text.includes(candidate));
    });
    if (!target) return "missing";
    const disabled = !!target.disabled || target.getAttribute('aria-disabled') === 'true';
    return disabled ? "disabled" : "enabled";
  })()`);
  return out.includes("enabled");
}

async function hasVisibleUploadPercentage(client: AgentBrowserClient): Promise<boolean> {
  const out = await client.evalJs(`(() => {
    const text = (document.body && document.body.innerText) ? document.body.innerText : "";
    const hasPercent = /\\b(?:100|[1-9]?\\d)%\\b/.test(text);
    return hasPercent ? "yes" : "no";
  })()`);
  return out.includes("yes");
}

export async function waitForPreviewReady(
  client: AgentBrowserClient,
  timeoutMs = 10 * 60 * 1000
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await client.waitForTextAny(PREVIEW_READY_MARKERS, 1500)) {
      return;
    }

    const hasPendingUploadMarker = await client.waitForTextAny(UPLOAD_PENDING_MARKERS, 1000);
    const hasPercent = await hasVisibleUploadPercentage(client);
    const publishEnabled = await isPublishButtonEnabled(client);

    // Fallback: allow publish when no upload-progress marker exists and publish is enabled.
    if (!hasPendingUploadMarker && !hasPercent && publishEnabled) {
      return;
    }

    await client.waitMs(1500);
  }
  throw new Error(
    "Upload not ready for publish. Wait for 'Preview ready!' (or enabled publish with no progress markers) before publishing."
  );
}

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

  await waitForPreviewReady(client);

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
