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

---

## Goals

Publish podcast episodes to Spotify for Creators via browser automation:
- Immediate or scheduled publication
- Metadata management (title, description, season/episode, cover art)
- Draft cleanup and verification

---

## Required Constraints

- Browser automation only; no Spotify APIs
- Prefer semantic interactions (role + accessible name > visible text > label/placeholder)
- Manual login; session reuse supported
- Validate success by business state, not action success
- For future `publish_at`: verify in Scheduled list; otherwise Published list
- Never publish while media processing (wait for readiness indicator)
- For scheduled: ensure target date/time fully configured before confirming

---

## NEVER

- Never confirm a scheduled publish without verifying the target date and time are fully configured.
- Never report success until the episode appears in the Published or Scheduled list — presence in Draft means the publish failed.
- Never return success before business-state verification passes.
- Never use static coordinates, positional indexes, or DOM structure assumptions for interaction.
- Never report a stage as complete based on click success alone — always validate by observable state change.

---

## Success Criteria

A run succeeds **only** when all conditions hold:

1. Episode appears in appropriate list:
   - **Scheduled**: when `publish_at` is future
   - **Published**: when immediate
2. Same episode does **not** appear in **Draft**
3. No unresolved required fields remain

---

## Runtime Inputs

See `skill.yaml` for complete schema.

**Required:** `audio_file`, `title`, `description`, and one of (`show_id` | `show_home_url` | `show_name`)

**Optional:** `season_number`, `episode_number`, `cover_image`, `publish_at`, `confirm_publish`, `disable_deterministic_cache`, `profile_dir`, `cdp_port`, `headed`

---

## Example Usage

**Immediate publish:**
```text
Publish episode: audio_file=/path/ep.mp3, title="Ep 18", description="...", show_id=abc123
```

**Scheduled publish:**
```text
Publish episode: audio_file=/path/ep.mp3, title="Ep 19", description="...", show_id=abc123, publish_at=2026-03-20T09:00:00+08:00
```

---

## Operational Mode

| Mode | Behavior |
|------|----------|
| **Default (unified)** | Deterministic cache → policy executor fallback |
| **Policy-only** | Set `disable_deterministic_cache=true` |

**Failure Handling:**
- Deterministic failure → continue with policy, record for optimization
- Policy failure → repair and retry until success criteria pass

> If policy executor stage decisions are unclear, load `references/architecture.md` before proceeding.

> **MANDATORY:** Before executing any UI interaction or workflow stage, load `references/plan.md` completely.

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
