---
name: labali-spotify-publish-episode
description: Publish podcast episodes on Spotify for Creators using browser-only semantic automation with manual-login session reuse.
license: MIT
compatibility: macOS / Linux; requires agent-browser CLI in PATH, Chrome with remote-debugging enabled (default port 9222), and an authenticated Spotify for Creators session; Node.js ≥ 18 + tsx; internet access required.
metadata:
  pattern: pipeline
---

# labali-spotify-publish-episode

Treat this skill as a layered system, not a single script.

## Layer Contract

| Layer | File | Purpose |
|-------|------|---------|
| **Policy** | `SKILL.md` | Goals, constraints, success criteria |
| **Strategy** | `references/architecture.md` | Execution model, failure handling |
| **Execution** | `scripts/*.ts` | Concrete implementation (replaceable) |

**Key Principle:** Scripts are replaceable assets. Policy layer remains stable across UI changes.

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

---

## Resources

| File | Purpose |
|------|---------|
| `references/architecture.md` | Architecture and development guidelines |
| `references/plan.md` | Workflow map and UI pattern hints |
| `scripts/auto-executor.ts` | Unified entry point |
| `scripts/executor.ts` | Policy executor |
| `scripts/deterministic.ts` | Deterministic cache |
| `tests/test_regression.sh` | Regression checks |
