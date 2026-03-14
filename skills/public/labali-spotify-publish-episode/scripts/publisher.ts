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

  // Navigate to schedule configuration screen
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

  // Enable schedule mode
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

  // Set the date using calendar with enhanced month navigation and in-place retry
  let dateSetSuccess = false;
  let lastDateResult = "";
  
  // Debug: log current page state before date selection
  const debugInfoBefore = await client.evalJs(`(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .map(b => ({ text: (b.textContent || '').trim(), aria: b.getAttribute('aria-label') || '', role: b.getAttribute('role') || 'button' }))
      .filter(x => x.text || x.aria);
    return JSON.stringify({ buttons: buttons.slice(0, 20) });
  })()`);
  console.log('[schedule-debug] Before click date:', debugInfoBefore);
  
  // First click the date button to open calendar, then wait and capture state
  await client.evalJs(`(() => {
    const dateButton = Array.from(document.querySelectorAll('button, [role="button"]'))
      .find((b) => {
        const text = (b.textContent || '').trim();
        return /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test(text);
      });
    if (dateButton) {
      dateButton.click();
      return 'clicked-date-button';
    }
    return 'missing-date-button';
  })()`);
  
  // Wait for calendar to open
  await client.waitMs(2000);
  
  // Debug: log page state after clicking date
  const debugInfoAfter = await client.evalJs(`(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .map(b => ({ text: (b.textContent || '').trim(), aria: b.getAttribute('aria-label') || '', role: b.getAttribute('role') || 'button' }))
      .filter(x => x.text || x.aria);
    const allText = document.body ? document.body.innerText.slice(0, 1000) : '';
    return JSON.stringify({ buttons: buttons.slice(0, 50), allText });
  })()`);
  console.log('[schedule-debug] After click date (calendar should be open):', debugInfoAfter);
  
  // Click the right arrow (next month) button multiple times to reach May 2026
  // Calendar shows Feb 2026 and Mar 2026, we need to reach May 2026
  // So we need to click next month 2 times (to get from Mar to May)
  console.log('[schedule-debug] Clicking next month button to reach May 2026...');
  
  for (let i = 0; i < 3; i++) {
    const clickResult = await client.evalJs(`(() => {
      // Find the next month button by exact aria-label
      const nextMonthBtn = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => {
          const aria = b.getAttribute('aria-label') || '';
          return aria === 'Move forward to switch to the next month.';
        });
      if (nextMonthBtn) {
        nextMonthBtn.click();
        return 'clicked-next-month';
      }
      return 'missing-next-month-button';
    })()`);
    console.log('[schedule-debug] Click', i+1, 'result:', clickResult);
    await client.waitMs(500);
  }
  
  // Now try to select May 15, 2026
  // First, let's check what month is visible after navigation
  const checkMonthResult = await client.evalJs(`(() => {
    const monthLabels = Array.from(document.querySelectorAll('div, span, strong, h2, h3'))
      .map((node) => (node.textContent || '').trim())
      .filter((text) => /[A-Z][a-z]+\\s+2026/.test(text));
    
    const mayDates = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((b) => {
        const aria = b.getAttribute('aria-label') || '';
        return aria.includes('May') && aria.includes('2026');
      })
      .map((b) => ({ text: (b.textContent || '').trim(), aria: b.getAttribute('aria-label') || '' }));
    
    return JSON.stringify({ monthLabels, mayDates: mayDates.slice(0, 10) });
  })()`);
  
  console.log('[schedule-debug] Month check after nav:', checkMonthResult);
  
  // Use Playwright-style click via CDP for more reliable interaction
  const targetDayStr = String(day);
  const targetButtonInfo = await client.evalJs(`(() => {
    const targetButton = Array.from(document.querySelectorAll('button, [role="button"]'))
      .find((b) => {
        const text = (b.textContent || '').trim();
        const aria = b.getAttribute('aria-label') || '';
        return text === ${JSON.stringify(targetDayStr)} && aria.includes('May') && aria.includes(${JSON.stringify(targetDayStr)}) && aria.includes('2026');
      });

    if (!targetButton) {
      return null;
    }

    const rect = targetButton.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);

  if (!targetButtonInfo) {
    lastDateResult = 'missing-target-date-button-in-dom';
  } else {
    // Use mouse click via CDP for more reliable interaction
    console.log('[schedule-debug] Clicking at position:', targetButtonInfo);

    // Try native click first
    const clickResult = await client.evalJs(`(() => {
      const targetButton = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => {
          const text = (b.textContent || '').trim();
          const aria = b.getAttribute('aria-label') || '';
          return text === ${JSON.stringify(targetDayStr)} && aria.includes('May') && aria.includes(${JSON.stringify(targetDayStr)}) && aria.includes('2026');
        });

      if (!targetButton) return 'button-not-found';

      // Try multiple ways to trigger selection
      targetButton.click();
      targetButton.focus();
      
      // Dispatch additional events
      targetButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      targetButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      
      return 'clicked';
    })()`);
    
    console.log('[schedule-debug] Click result:', clickResult);
    
    // Wait for selection to update
    await client.waitMs(1000);
    
    // Verify by checking the date input field
    const verifyResult = await client.evalJs(`(() => {
      const dateButton = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((b) => /\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test((b.textContent || '').trim()));
      
      if (dateButton) {
        const dateText = (dateButton.textContent || '').trim();
        return 'date-field-shows:' + dateText;
      }
      
      return 'no-date-field-found';
    })()`);
    
    console.log('[schedule-debug] Verify result:', verifyResult);

    // Check if the date field shows the expected date (with or without leading zero)
    const expectedDateM = String(month);
    const expectedDateD = String(day);
    const expectedDateY = String(year);
    if (verifyResult.includes(`${expectedDateM}/${expectedDateD}/${expectedDateY}`)) {
      dateSetSuccess = true;
    } else {
      lastDateResult = verifyResult;
    }
  }
  
  if (!dateSetSuccess) {
    throw new Error(`Failed to set schedule date: ${lastDateResult}`);
  }

  // Set the time (hour, minute, AM/PM)
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

  // Verify the scheduled values are retained
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
