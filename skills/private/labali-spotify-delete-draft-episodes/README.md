# labali-spotify-delete-draft-episodes Usage

How to use the `labali-spotify-delete-draft-episodes` skill in chat to delete Draft episodes on Spotify for Creators.

Note: this skill is currently under `skills/private` for internal use and ongoing tuning.

## 1) Describe the task in natural language (without naming the skill)

Use this mode when you want to describe the goal directly and let the agent select the skill.

Required information:

- `show_id`: Spotify show id (used to open the target show directly)

Optional information:

- `delete_all_drafts`: `false` by default; set `true` to delete all Draft episodes
- `max_delete`: safety cap for delete-all mode (default `200`)
- `show_home_url`: direct show home page URL (if omitted, derived from `show_id`)
- `show_name`: show name fallback only
- `disable_deterministic_cache`: `true` to skip deterministic cache and run policy executor directly
- `profile_dir`: Chrome user data directory for session reuse (default `~/.chrome-spotify`)
- `cdp_port`: Chrome DevTools port (default `9222`)
- `headed`: run browser in headed mode (default `true`)

Behavior by mode:

- Default (`delete_all_drafts=false`): delete only the first Draft episode.
- Full cleanup (`delete_all_drafts=true`): delete all Draft episodes and verify Draft is empty.

### Full Prompt Example (Natural Language)

```text
Please remove one Draft episode for this Spotify show.
show_id=5WGV9fU6CKA7QLpfF7DQ0h
Use default mode and stop after deleting the first Draft item.
```

## 2) Explicitly specify the skill

Use this mode when you want to force execution with this specific skill.

Recommended style: include the skill name explicitly in the prompt (for example `$labali-spotify-delete-draft-episodes` or `labali-spotify-delete-draft-episodes`).

### Full Prompt Example (Delete First Draft)

```text
Please use $labali-spotify-delete-draft-episodes for this task.
show_id=5WGV9fU6CKA7QLpfF7DQ0h
delete_all_drafts=false
cdp_port=9222
headed=true

Delete only the first Draft episode and then stop.
```

### Full Prompt Example (Delete All Drafts)

```text
Please use $labali-spotify-delete-draft-episodes for this task.
show_id=5WGV9fU6CKA7QLpfF7DQ0h
delete_all_drafts=true
max_delete=200
cdp_port=9222
headed=true

Delete all Draft episodes and verify no Draft episodes remain.
```

## 3) Minimal Template (Copy/Paste)

```text
Please clean Draft episodes for Spotify show.
show_id:
delete_all_drafts (true/false, default false):
max_delete (optional):
```
