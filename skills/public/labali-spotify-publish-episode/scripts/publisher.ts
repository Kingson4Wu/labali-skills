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

async function isPrimaryPublishActionEnabled(
  client: AgentBrowserClient,
  mode: "publish" | "schedule" = "publish"
): Promise<boolean> {
  const out = await client.evalJs(`(() => {
    const normalize = (s) => (s || '').trim().toLowerCase();
    const candidates = ${JSON.stringify(
      (mode === "schedule" ? ["Schedule"] : ACTION_CANDIDATES.publish).map((x) => x.toLowerCase())
    )};
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
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
  mode: "publish" | "schedule" = "publish",
  timeoutMs = 10 * 60 * 1000
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await client.waitForTextAny(PREVIEW_READY_MARKERS, 1500)) {
      return;
    }

    const hasPendingUploadMarker = await client.waitForTextAny(UPLOAD_PENDING_MARKERS, 1000);
    const hasPercent = await hasVisibleUploadPercentage(client);
    const publishEnabled = await isPrimaryPublishActionEnabled(client, mode);

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

  const match = publishAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (!match) {
    throw new Error(`Invalid publish_at value: ${publishAt}`);
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour24 = Number(hourRaw);
  const minute = Number(minuteRaw);
  const dateValue = `${month}/${day}/${year}`;
  const longDateLabel = new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hourValue = String(hour24 % 12 || 12).padStart(2, "0");
  const minuteValue = String(minute).padStart(2, "0");
  const targetMonthLabel = new Date(year, month - 1, 1, 12, 0, 0).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const selectedTargetAria = `Selected. ${longDateLabel}`;

  for (let i = 0; i < 6; i += 1) {
    const hasScheduleSurface =
      (await client.hasText("Publish date")) ||
      ((await client.hasText("Now")) && (await client.hasText("Schedule")));
    if (hasScheduleSurface) {
      break;
    }
    const hasStepForward = await client.waitForTextAny(["Next", "Continue", "Review", "Save and continue"], 3000);
    if (!hasStepForward) {
      break;
    }
    try {
      await client.clickRoleByNames("button", ["Next", "Continue", "Review", "Save and continue"]);
    } catch {
      await client.clickTextByCandidates(["Next", "Continue", "Review", "Save and continue"]);
    }
    await client.waitMs(2000);
  }

  await retry(3, async () => {
    const result = await client.evalJs(`(() => {
      const labels = Array.from(document.getElementsByTagName('label'));
      const label = labels.find((x) => x.htmlFor === 'publish-date-schedule');
      if (label) {
        label.click();
        return 'clicked-label';
      }
      const input = document.getElementById('publish-date-schedule');
      if (input) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'checked-input';
      }
      return 'no-schedule-control';
    })()`);
    if (!result.includes("clicked") && !result.includes("checked")) {
      try {
        await client.clickRoleByNames("button", ACTION_CANDIDATES.schedule);
      } catch {
        await client.clickTextByCandidates(ACTION_CANDIDATES.schedule);
      }
    }
  });

  await retry(3, async () => {
    const result = await client.evalJs(`(() => {
      const currentDateButton = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test((b.textContent || '').trim()));
      if (currentDateButton) currentDateButton.click();

      const targetText = ${JSON.stringify(dateValue)};
      const targetDay = ${JSON.stringify(String(day))};
      const targetAria = ${JSON.stringify(longDateLabel)};
      const selectedTargetAria = ${JSON.stringify(selectedTargetAria)};
      const nextMonthLabel = "Move forward to switch to the next month.";
      const targetMonthLabel = ${JSON.stringify(targetMonthLabel)};
      const targetMonthIndex = ${year} * 12 + ${month - 1};
      const parseMonthIndex = (label) => {
        if (!label) return null;
        const parts = label.trim().split(/\\s+/);
        if (parts.length < 2) return null;
        const monthName = parts[0];
        const yearValue = Number(parts[1]);
        const monthValue = new Date(\`\${monthName} 1, 2000\`).getMonth();
        if (Number.isNaN(yearValue) || Number.isNaN(monthValue)) return null;
        return yearValue * 12 + monthValue;
      };
      const findVisibleMonthLabel = () => {
        const nodes = Array.from(document.querySelectorAll('div, span, strong, h2, h3'));
        const labels = nodes
          .map((node) => (node.textContent || '').trim())
          .filter((text) => /^([A-Z][a-z]+)\\s+\\d{4}$/.test(text));
        return labels.find((label) => label === targetMonthLabel) || labels[0] || null;
      };


      const clickNextMonth = () => {
        const ariaCandidates = ['move forward to switch to the next month.', 'next month', 'next', 'forward', '下一月', '下个月'];
        const textCandidates = ['>', '›', '»', '→'];
        const nodes = Array.from(document.querySelectorAll('button, [role="button"], [aria-label]')) as HTMLElement[];
        const byAria = nodes.find((el) => {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          return ariaCandidates.some((c) => aria.includes(c));
        });
        const byText = nodes.find((el) => {
          const text = (el.textContent || '').trim();
          return textCandidates.includes(text);
        });
        const fallback = nodes.find((el) => (el.getAttribute('aria-label') || '').toLowerCase().includes('next'));
        const next = byAria || byText || fallback;
        if (!next) return 'missing-next-month-button';
        next.click();
        return 'clicked';
      };

      const trySelectTarget = () => {
        const targetButton = Array.from(document.querySelectorAll('button, [role="button"]'))
          .find((b) =>
            (b.textContent || '').trim() === targetText ||
            (b.textContent || '').trim() === targetDay ||
            (b.textContent || '').trim().includes(targetAria) ||
            (b.getAttribute('aria-label') || '').includes(selectedTargetAria) ||
            (b.getAttribute('aria-label') || '').includes(targetAria)
          );
        if (!targetButton) return 'missing';
        targetButton.click();
        const selected = Array.from(document.querySelectorAll('button, [role="button"]'))
          .find((b) => (b.getAttribute('aria-label') || '').includes(selectedTargetAria));
        return selected ? 'ok' : 'date-not-selected';
      };

      const initialMonthLabel = findVisibleMonthLabel();
      const initialMonthIndex = parseMonthIndex(initialMonthLabel);
      if (initialMonthIndex !== null) {
        const monthDelta = targetMonthIndex - initialMonthIndex;
        for (let i = 0; i < Math.max(0, monthDelta); i += 1) {
          const status = clickNextMonth();
          if (status !== 'clicked') break;
        }
      }

      for (let j = 0; j < 30; j += 1) {
        const outcome = trySelectTarget();
        if (outcome === 'ok' || outcome === 'date-not-selected') return outcome;
        const status = clickNextMonth();
        if (status !== 'clicked') return status || 'missing-next-month-button-after-advance';
      }

      // Fallback: directly set date input if calendar buttons are not reliable.
      const setInputValue = (input: HTMLInputElement, value: string) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) { setter.call(input, value); } else { (input as any).value = value; }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      };
      const dateInputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const dateCandidate = dateInputs.find((el) => {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        const val = (el.value || '').toLowerCase();
        return aria.includes('date') || placeholder.includes('mm') || /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test(val);
      });
      if (dateCandidate) {
        setInputValue(dateCandidate, dateValue);
        const retained = dateCandidate.value.includes(dateValue);
        return retained ? 'ok' : 'date-input-not-retained:' + dateCandidate.value;
      }

      return 'missing-date-after-advance';
    })()`);
    if (!result.includes("ok")) {
      throw new Error(`Failed to set schedule date: ${result}`);
    }
  });

  await retry(3, async () => {
    const result = await client.evalJs(`(() => {
      const setInputValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(input, value);
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      };

      const hour = document.querySelector("input[aria-label='Hour picker']");
      const minute = document.querySelector("input[aria-label='Minute picker']");
      const meridiem = document.querySelector("select[aria-label='Meridiem picker']");
      if (!(hour && minute && meridiem)) return 'missing-time-controls';

      setInputValue(hour, ${JSON.stringify(hourValue)});
      setInputValue(minute, ${JSON.stringify(minuteValue)});
      meridiem.value = ${JSON.stringify(meridiem)};
      meridiem.dispatchEvent(new Event('input', { bubbles: true }));
      meridiem.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ hour: hour.value, minute: minute.value, meridiem: meridiem.value });
    })()`);
    if (!result.includes(hourValue) || !result.includes(minuteValue) || !result.includes(meridiem)) {
      throw new Error(`Failed to set schedule time: ${result}`);
    }
  });

  await retry(3, async () => {
    const result = await client.evalJs(`(() => {
      const dateButton = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test((b.textContent || '').trim()));
      const hour = document.querySelector("input[aria-label='Hour picker']");
      const minute = document.querySelector("input[aria-label='Minute picker']");
      const meridiem = document.querySelector("select[aria-label='Meridiem picker']");
      return JSON.stringify({
        date: dateButton ? (dateButton.textContent || '').trim() : '',
        hour: hour ? hour.value : '',
        minute: minute ? minute.value : '',
        meridiem: meridiem ? meridiem.value : '',
      });
    })()`);
    if (!result.includes(dateValue) ||
        !result.includes(hourValue) ||
        !result.includes(minuteValue) ||
        !result.includes(meridiem)) {
      throw new Error(`Scheduled values not retained after selection: ${result}`);
    }
  });
}

export async function publishEpisode(
  client: AgentBrowserClient,
  confirmPublish: boolean,
  mode: "publish" | "schedule" = "publish"
): Promise<void> {
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

  // Only force "Now" for immediate publish runs. Scheduled runs must preserve the prior selection.
  if (mode === "publish" && (await client.hasText("Now"))) {
    await client.evalJs(
      "(() => { const labels = Array.from(document.getElementsByTagName('label')); const label = labels.find((x) => x.htmlFor === 'publish-date-now'); if (label) { label.click(); return 'clicked-label'; } const input = document.getElementById('publish-date-now'); if (input) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); return 'checked-input'; } return 'no-now-control'; })()"
    );
    try {
      await client.clickRoleByNames("radio", ["Now"]);
    } catch {
      // Best effort only; evalJs attempt above may already satisfy this requirement.
    }
  }

  await waitForPreviewReady(client, mode);

  await retry(3, async () => {
    try {
      await client.clickRoleByNames(
        "button",
        mode === "schedule" ? ["Schedule"] : ACTION_CANDIDATES.publish
      );
    } catch {
      await client.clickTextByCandidates(
        mode === "schedule" ? ["Schedule"] : ACTION_CANDIDATES.publish
      );
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
