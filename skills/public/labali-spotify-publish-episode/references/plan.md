# Semantic Workflow Plan

## Workflow Stages

| Stage | Description |
|-------|-------------|
| **1. Entry & Auth** | Open creators domain or reuse existing tab; wait for manual login if needed |
| **2. Show Targeting** | Reuse current show context or resolve by semantic show name |
| **3. Episode Stage Detection** | Detect: episode list, upload/details wizard, or review/publish step |
| **4. Media & Metadata** | Upload audio; fill title/description; optionally upload cover image |
| **5. Review & Publish** | Advance wizard to publish controls; satisfy required fields; publish |
| **6. Outcome Verification** | Verify title in `Published`/`Scheduled` and not in `Draft` |

---

## Detailed Flow

### 1. Entry & Auth
- Open `creators.spotify.com` or reuse existing creators tab
- If logged out: route through login entry, wait for manual auth completion

### 2. Show Targeting
- Reuse current show context when URL or page state confirms match
- Otherwise: resolve show by semantic show name actions

### 3. Episode Stage Detection
Detect current page state:
- **Episode list** → Navigate to create episode
- **Upload/details wizard** → Continue from current stage
- **Review/publish step** → Proceed to publish actions

### 4. Media & Metadata
- **Audio upload:** Use semantic upload controls; fallback to generic file input only when wrappers block direct upload
- **Title/Description:** Native input first (focus/select-all/insert text), then semantic and DOM fallbacks
- **Cover image:** Optional upload via semantic controls
- **Large files:** Hitting a 50MB transfer cap usually means the agent-browser Chrome is remote even when using `--cdp`; start a truly local Chrome or expose the file via a local URL to avoid the limit.

### 5. Review & Publish
- Advance wizard with `Next` until publish controls available
- Satisfy required publish-date controls when present
- Publish now by default (unless caller disables final publish)

### 6. Outcome Verification
- Verify title appears in `Published` filter (or `Scheduled` for future publish)
- Verify same title does **not** appear in `Draft` filter
- If verification fails: return failure regardless of click outcomes

---

## Current UI Pattern Hints

> **Note:** These are **observed UI patterns** (hints, not requirements). Update this file when UI changes.

### Key Semantic Markers

| Semantic State | Current UI Patterns |
|----------------|---------------------|
| **Upload Processing** | "Uploading...", "Processing", progress bar, percentage |
| **Upload Ready** | "Preview ready!", "Ready to publish", publish button enabled |
| **Immediate Publish** | Radio/toggle labeled "Now", "Publish now" |
| **Schedule** | Radio/toggle labeled "Schedule", "Set date and time" |
| **Published Filter** | "Published", "Published episodes" |
| **Scheduled Filter** | "Scheduled", "Scheduled episodes" |
| **Draft Filter** | "Draft", "Draft episodes" |

### Common Action Labels

| Semantic Action | Current Button/Link Text |
|-----------------|--------------------------|
| **Create Episode** | "New episode", "Create a new episode" |
| **Upload Audio** | "Upload audio", "Episode file", "Select file" |
| **Upload Cover** | "Episode cover", "Cover image", "Artwork" |
| **Navigate Next** | "Next", "Continue", "Review" |
| **Publish** | "Publish", "Publish episode", "Save and publish" |
| **Schedule** | "Schedule", "Schedule publish" |
| **Delete Draft** | "Delete episode", "Delete draft" |

### Navigation Markers

| Semantic Location | Current Indicators |
|-------------------|-------------------|
| **Dashboard** | "Dashboard", "Shows", "Episodes", "Analytics" |
| **Login Required** | "Log in", "Sign up", "Continue with Spotify" |
| **Episode Wizard** | URL contains `/episode/*/wizard`, upload surface visible |

---

## Self-Healing Triggers

- Missing expected control labels
- UI transitions that do not produce expected next-stage markers
- Publish action clicked but list-state verification fails

---

## Recovery Order

1. Re-snapshot and re-evaluate stage
2. Retry with semantic candidate alternatives
3. Use bounded fallback paths for upload/editor quirks
4. Re-run publish and verification checks

---

## Execution Mode

**Unified Runtime Order:**
1. **Deterministic trajectory cache** (`deterministic.ts`) - optional acceleration
2. **Auto-downgrade to policy executor** (`executor.ts`) - mandatory baseline

**Configuration:**
- Set `disable_deterministic_cache=true` to skip deterministic and run policy directly
- Policy executor remains required baseline; deterministic is optional
- On policy failure: repair and retry until publish verification passes
- Log deterministic failure context; use policy-success evidence to improve deterministic mode

---

## UI Change Protocol

When Spotify updates their UI:

1. **Check if semantic goals still achievable** (SKILL.md constraints)
2. **Update this file** with new UI pattern hints
3. **Update scripts** with new selectors/matching logic
4. **Do NOT modify SKILL.md** unless the fundamental workflow changes

| Change Type | Update Required |
|-------------|-----------------|
| Text change only | This file only |
| Element reposition | Scripts only |
| New required field | This file + scripts |
| Workflow restructure | All layers |
