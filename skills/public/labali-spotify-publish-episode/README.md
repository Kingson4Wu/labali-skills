# labali-spotify-publish-episode Usage

How to use the `labali-spotify-publish-episode` skill to publish podcast episodes on Spotify for Creators.

## Quick Start

### Install

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

### Required Information

| Field | Description |
|-------|-------------|
| `audio_file` | Audio file path (absolute or workspace-relative) |
| `title` | Episode title |
| `description` | Episode description |
| `show_id` | Spotify show ID (preferred) or `show_home_url` or `show_name` |

### Optional Parameters

| Field | Description |
|-------|-------------|
| `season_number` | Season number (positive integer) |
| `episode_number` | Episode number (positive integer) |
| `cover_image` | Cover image path |
| `publish_at` | Scheduled publish time (ISO-8601) |
| `confirm_publish` | Execute final publish (`true`/`false`, default `true`) |
| `disable_deterministic_cache` | Skip deterministic cache (`true`/`false`, default `false`) |
| `profile_dir` | Chrome user data directory (default `~/.chrome-spotify`) |
| `cdp_port` | Chrome DevTools port (default `9222`) |
| `headed` | Run headed browser (default `true`) |

---

## Usage Modes

### Mode 1: Natural Language (Implicit Skill Selection)

Describe your goal; the agent selects the skill automatically.

**Example:**

```text
Please publish a podcast episode for me on Spotify for Creators.
Show id: <show_id>
Audio file: /absolute/path/to/audio/2026-03-10-episode-18.mp3
Title: Episode 18 - Agent Reliability in Production
Description: In this episode we discuss layered execution architecture, strategy cache, and regression verification practices.
Season number: 2
Episode number: 18
Cover image: /absolute/path/to/audio/cover-ep18.jpg
Scheduled publish time: 2026-03-12T09:00:00+08:00
Please publish directly and do not stop at the confirmation screen.
```

### Mode 2: Explicit Skill Invocation

Force execution with this specific skill by naming it (`$labali-spotify-publish-episode`).

**Example:**

```text
Please use $labali-spotify-publish-episode for this publishing task with the following parameters:
audio_file=/absolute/path/to/audio/2026-03-10-episode-19.mp3
title=Episode 19 - Deterministic Cache vs Policy Executor
description=Compare deterministic trajectory cache and policy executor in terms of reliability, speed, and maintenance cost.
show_id=<show_id>
show_name=Labali AI Weekly
season_number=2
episode_number=19
publish_at=2026-03-15T10:30:00+08:00
confirm_publish=true
disable_deterministic_cache=false
profile_dir=~/.chrome-spotify
cdp_port=9222
headed=true

If login is required, pause and prompt me to complete manual login, then continue.
After publishing, verify that this title appears in Published and does not appear in Draft.
```

---

## Templates

### Minimal Template

```text
Please publish a Spotify podcast episode:
Show id (show_id):
Audio path (audio_file):
Title (title):
Description (description):
Publish immediately? (confirm_publish=true/false):
(Optional) Scheduled publish time (publish_at):
```

### Batch Upload Template

Use for publishing multiple episodes in sequence under the same `show_id`.

**Requirements:**
1. Execute strictly in list order
2. Publish one item, then continue to the next
3. Verify each item before continuing (title in `Published`, not in `Draft`)
4. Stop immediately on failure and report the reason

```text
Please use $labali-spotify-publish-episode to batch publish the following podcast episodes.

Global parameters:
show_id=<show_id>

Episode list:
- [1]
  audio_file=/absolute/path/episode-01.mp3
  title=Episode 1 title
  description=Episode 1 description
  season_number=6
  episode_number=1
- [2]
  audio_file=/absolute/path/episode-02.mp3
  title=Episode 2 title
  description=Episode 2 description
  season_number=6
  episode_number=2
- [3]
  audio_file=/absolute/path/episode-03.mp3
  title=Episode 3 title
  description=Episode 3 description
  season_number=6
  episode_number=3
```

**Note:** For immediate publish, omit `publish_at`. For scheduled publish, set `publish_at` per episode.

---

## Update

To update to the latest version, run the install command again:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```
