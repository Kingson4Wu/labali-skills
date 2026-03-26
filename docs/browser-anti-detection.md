# Browser Anti-Detection Principles

> Load this document alongside `docs/browser-automation.md` when writing or modifying any browser automation skill.
> `browser-automation.md` defines HOW scripts run (execution model, file structure, semantic interaction).
> This document defines HOW scripts must behave to avoid triggering risk-control systems.
> Apply clusters proportional to the target platform's known risk-control intensity — see Skill Type table below.

---

## Skill Type Reference

| Skill type | Examples | Applicable clusters |
|------------|----------|---------------------|
| **Extraction** (read / download) | XHS, Douyin, Weibo | All clusters |
| **Action** (publish / submit) | Spotify | Network, Timing, Fingerprint, Session, Navigation |

---

## Principle Clusters

### 1. Network — All traffic

**Applies to:** All

- All network requests (page navigation, API calls, media) must go through the browser context.
- Never use bare HTTP clients (`urllib`, `requests`, `httpx`, `aiohttp`, `fetch` outside browser) to contact a platform domain.
- Authenticated cookies, TLS fingerprint, and browser-specific headers are only present when requests originate from the browser.

**Why:** Bare HTTP clients lack browser-native headers (`sec-ch-ua`, `sec-fetch-*`, `Accept-Encoding`) and TLS fingerprint — risk-control systems identify non-browser requests through these signals.

---

### 2. Media Capture — Already-loaded resources

**Applies to:** Extraction

- Prefer capturing resources via `page.on("response")` interception during normal page load.
- If interception missed a resource, read from browser cache via `page.evaluate(() => fetch(url, { cache: "force-cache" }))`.
- Only use `page.request.get()` for resources not yet loaded by the browser (e.g. video streams that require explicit play before buffering).
- Never issue a new outbound HTTP request for an image or asset the browser has already downloaded.

**Why:** Re-requesting an already-loaded resource doubles traffic with a non-browser request context — a clear bot signal.

---

### 3. Timing — Pacing and rhythm

**Applies to:** All

- Every `waitForTimeout` / `sleep` call must include a random component (e.g. `base + Math.random() * range`). Never use a fixed constant.
- Do not issue 3 or more sequential actions with zero delay between them.
- Between distinct user-visible actions (clicks, scrolls, navigations), add a randomized pause that mimics human reading/reaction time (typically 0.5–2.5s).
- For batch runs processing more than one item: add a session cool-down every 5–10 items (30–60s pause).

**Why:** Uniform or near-zero timing is the clearest bot fingerprint. Humans have variable reaction times; machines are precise and fast.

---

### 4. Fingerprint — Browser environment

**Applies to:** All

- Suppress automation markers in the browser JS environment: override `navigator.webdriver` to `undefined`; do not expose automation-specific globals.
- Always set locale, timezone, and viewport to match the user's real system (not defaults).
- Always use headed mode (`headless: false`) — never run headless for platforms that perform client-side bot detection.
- Do not open Chrome DevTools during production runs — it triggers additional protocol activity detectable by advanced anti-bot systems.
- Do not use Playwright's `slowMo` parameter in production — it produces unnaturally uniform delays.

**Why:** Platform front-end JS actively probes `navigator.webdriver`, `window.chrome`, `navigator.plugins`, and related properties. Default Playwright exposes automation markers.

---

### 5. Session — Authentication and context

**Applies to:** All

- Always reuse the existing authenticated browser session. Never create a fresh browser context when an authenticated profile is available.
- Persist login state (cookies / localStorage) to disk and reload on subsequent runs.
- **Tab selection:** when connecting to an existing browser via CDP, find an existing tab for the target domain and navigate it to the target URL. If no such tab exists, open a new tab. Never navigate a tab that belongs to an unrelated page (e.g. Gmail, devtools, another service).
- Never launch a second browser instance when an existing CDP endpoint is already responding.

**Why:** A fresh session has no browsing history — highly suspicious. Tab hijacking across domains creates detectable cross-origin navigation patterns.

---

### 6. Navigation — Entry paths and URL integrity

**Applies to:** All

- Enter the target page via a natural path (e.g. home page or list page) rather than jumping directly to a deep link with no referrer.
- Avoid re-navigating to a page already visited in the same run; reuse the open tab instead.
- **Preserve URL query parameters exactly as received.** Do not normalize, decode, or strip tokens (e.g. `xsec_token`, `share_id`, `access_token`) before navigating. Platforms use server-side token validation; stripped parameters silently produce degraded content (wrong item count, missing text) with no error.

**Why:** Direct deep-link access with no referrer is a classic crawler pattern. Token stripping produces silent failures that are hard to diagnose and reveal non-human URL handling.

---

### 7. Interaction — Sequential human-like actions

**Applies to:** Extraction

- Click through paginated or carousel content one step at a time with randomized delays (700–1400ms per step).
- After navigating to a page, scroll down briefly to simulate reading before interacting with elements.
- Never batch-extract all items from the DOM in a single operation when a user would encounter them sequentially (e.g. image carousel, paginated comments).
- Use `page.click()` or `element.click()` for interactions. Do not dispatch synthetic events via JS injection.

**Why:** Batch DOM scraping and synthetic events are detectable non-human patterns. Server-side behavioral analysis logs action sequences.

---

## Risk Signal Handling

### Hard signals — stop immediately

Do not retry in the current session. Prompt user for manual intervention.

- CAPTCHA or verification challenge appears
- Page redirects to login (`/login` in URL, or login form present)
- Explicit rate-limit message ("操作过于频繁", "请稍后再试", "too many requests")
- Account anomaly or security warning

### Soft signals — one recovery attempt

- **Empty content on a known-valid URL:** scroll down, wait 3–5s, re-check once. If still empty, treat as a hard signal.

### On stop (any signal)

- Keep all successfully downloaded or processed files — do not delete partial output.
- Log the signal type and the identifier of the last successfully processed item (for manual resumability).
- Do not attempt automatic retry within the same session.

---

## How Skills Reference This File

Add the following row to your SKILL.md `Resources` table:

```
| Always — when writing or modifying automation scripts | `docs/browser-anti-detection.md` | — |
```

The loading trigger is **mandatory**, not situational. Load both this file and `docs/browser-automation.md` at script-writing time.

---

## Compliance Checklist

Run these checks before finalizing any browser automation code:

| # | Gate | Pass condition |
|---|------|----------------|
| 1 | Network | No bare HTTP client (urllib/requests/httpx/aiohttp) contacts a platform domain |
| 2 | Media Capture | Already-loaded resources use interception or cache — not a new outbound request (video streams excepted) |
| 3 | Timing (per-action) | Every wait has a random variable component — no fixed constants |
| 4 | Timing (session) | Batch runs include a cool-down every 5–10 items |
| 5 | Fingerprint | `navigator.webdriver` suppressed; no DevTools UI; no `slowMo` |
| 6 | Session | Existing authenticated session reused; no fresh context created unnecessarily |
| 7 | Tab selection | Code finds existing target-domain tab or opens new tab — never navigates an unrelated tab |
| 8 | URL integrity | Query parameters preserved exactly as received; no normalization before navigation |
| 9 | Risk signals | Hard and soft signals have distinct handlers; partial output preserved on stop |
