---
name: labali-spotify-publish-episode
description: >
  Publish podcast episodes on Spotify for Creators using browser-only semantic automation with
  manual-login session reuse. Use when asked to publish, upload, release, or schedule a podcast
  episode on Spotify for Creators (creators.spotify.com). Trigger phrases: "publish episode",
  "upload podcast", "release episode", "schedule podcast", "spotify creator".
license: MIT
compatibility: >
  macOS / Linux; requires agent-browser CLI in PATH, Chrome with remote-debugging enabled
  (default port 9222), and an authenticated Spotify for Creators session; Node.js >= 18 + tsx;
  internet access required.
allowed-tools: "Bash(npx:*), Bash(pnpm:*)"
metadata:
  pattern: pipeline
---

# labali-spotify-publish-episode

This skill follows a three-layer architecture (Policy / Strategy / Execution).
See `references/architecture.md` for layer boundaries and development constraints.

> **MANDATORY:** Before executing any UI interaction or workflow stage, load `references/plan.md` completely.

---

## Required Constraints

- Browser automation only; no Spotify APIs
- Prefer semantic interactions (role + accessible name > visible text > label/placeholder)
- Manual login; session reuse supported
- Validate success by business state, not action success
- Before advancing any wizard step, ask: what observable state proves this stage completed — not what action should have caused it
- For future `publish_at`: verify in Scheduled list; otherwise Published list
- Never publish while media processing (wait for readiness indicator)
- For scheduled: ensure target date/time fully configured before confirming
- Before initiating publish: verify all required fields are filled and no validation errors are visible

---

## NEVER

- Never confirm a scheduled publish without verifying the target date and time are fully configured — Spotify's scheduling UI allows clicking Schedule with a malformed or default date, silently publishing at the wrong time.
- Never report success until the episode appears in the Published or Scheduled list — Spotify renders a success confirmation before list state actually updates; click success is not list presence, and presence in Draft means the publish failed.
- Never return success before business-state verification passes — the publish action completing and the episode being live are two separate events.
- Never use static coordinates, positional indexes, or DOM structure assumptions for interaction — Spotify's UI layout shifts between sessions, viewports, and A/B variants.
- Never report a stage as complete based on click success alone — always validate by observable state change — buttons return success even when the underlying action is queued or rate-limited.

---

## Success Criteria

A run succeeds **only** when all conditions hold:

1. Episode appears in appropriate list:
   - **Scheduled**: when `publish_at` is future
   - **Published**: when immediate
2. Same episode does **not** appear in **Draft**

---

## Runtime Inputs

See `skill.yaml` for complete schema.

**Required:** `audio_file`, `title`, `description`, and one of (`show_id` | `show_home_url` | `show_name`)

**Optional:** `season_number`, `episode_number`, `cover_image`, `publish_at`, `confirm_publish`, `disable_deterministic_cache`, `profile_dir`, `cdp_port`, `headed`

---

## Operational Mode

| Mode | Behavior |
|------|----------|
| **Default (unified)** | Deterministic cache → policy executor fallback |
| **Policy-only** | Set `disable_deterministic_cache=true` |

**Startup check (MANDATORY before every run):**
If `.cache/spotify-publish/pending-regen.json` exists:
1. Read it (contains `trajectory_path` and `deterministic_path`)
2. Read `trajectory_path` (the successful policy trajectory)
3. Rewrite `deterministic_path` using the trajectory patterns — role+name only, no hardcoded ref keys
4. Delete `pending-regen.json`
5. Proceed with the normal publish workflow (deterministic will now work)

**Failure Handling:**
- Deterministic failure → continue with policy, write pending-regen.json marker
- Policy failure → re-snapshot page state → re-detect current stage → retry from last known good stage; max 3 attempts before reporting failure with: current stage name, last observable state, and the action that failed

> If policy executor stage decisions are unclear, load `references/architecture.md` before proceeding.

---

## Resources

### Reference Loading

| Scenario | Must load | Do NOT load |
|----------|-----------|-------------|
| Policy executor stage unclear | `references/architecture.md` | `references/plan.md` |
| UI interaction / workflow steps | `references/plan.md` | `references/architecture.md` |
| UI change or selector update | `references/plan.md` | — |
| Script development / layer boundaries | `references/architecture.md` | `references/plan.md` |

### Scripts

| File | Purpose |
|------|---------|
| `scripts/auto-executor.ts` | Unified entry point |

For the full script inventory, see `references/architecture.md` → Script Roles.
