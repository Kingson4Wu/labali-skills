# labali-spotify-publish-episode Usage

How to use the `labali-spotify-publish-episode` skill in chat to publish a podcast episode on Spotify for Creators.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-spotify-publish-episode
```

Update to the latest version (run the install command again)

## 2) Describe the task in natural language (without naming the skill)

Use this mode when you want to describe the goal directly and let the agent select the skill.

Required information:

- `audio_file`: audio file path (absolute path or workspace-relative path)
- `title`: episode title
- `description`: episode description
- `show_id`: Spotify show id (used to open the target show directly)

Optional information:

- `show_name`: show name (fallback only)
- `season_number`: season number (positive integer)
- `episode_number`: episode number (positive integer)
- `cover_image`: cover image path
- `publish_at`: scheduled publish time (ISO-8601 datetime)
- `confirm_publish`: whether to perform the final publish action (`false` means stop before final publish)
- `show_home_url`: direct show home page URL (if omitted, derived from `show_id`)
- `disable_deterministic_cache`: `true` to skip deterministic cache and run policy executor directly
- `profile_dir`: Chrome user data directory for session reuse (default `~/.chrome-spotify`)
- `cdp_port`: Chrome DevTools port (default `9222`); executor reuses existing session first, or launches Chrome automatically
- `headed`: run browser in headed mode (default `true`)

### Full Prompt Example (Natural Language)

```text
Please publish a podcast episode for me on Spotify for Creators.
Show id: 1234567890abcdef123456
Audio file: /Users/kingsonwu/audio/2026-03-10-episode-18.mp3
Title: Episode 18 - Agent Reliability in Production
Description: In this episode we discuss layered execution architecture, strategy cache, and regression verification practices.
Season number: 2
Episode number: 18
Cover image: /Users/kingsonwu/audio/cover-ep18.jpg
Scheduled publish time: 2026-03-12T09:00:00+08:00
Please publish directly and do not stop at the confirmation screen.
```

## 3) Explicitly specify the skill

Use this mode when you want to force execution with this specific skill.

Recommended style: include the skill name explicitly in the prompt (for example `$labali-spotify-publish-episode` or `labali-spotify-publish-episode`).

Information guidance:

- Required fields are: `audio_file`, `title`, `description`, `show_id`
- Add optional parameters based on your publishing strategy (publish now, schedule, preflight only, etc.)

### Full Prompt Example (Explicit Skill)

```text
Please use $labali-spotify-publish-episode for this publishing task and run strictly with the following parameters:
audio_file=/Users/kingsonwu/audio/2026-03-10-episode-19.mp3
title=Episode 19 - Deterministic Cache vs Policy Executor
description=Compare deterministic trajectory cache and policy executor in terms of reliability, speed, and maintenance cost.
show_id=1234567890abcdef123456
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

## 4) Minimal Template (Copy/Paste)

```text
Please publish a Spotify podcast episode:
Show id (show_id):
Audio path (audio_file):
Title (title):
Description (description):
Publish immediately? (confirm_publish=true/false):
(Optional) Scheduled publish time (publish_at):
```
