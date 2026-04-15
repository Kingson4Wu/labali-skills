---
name: labali-apple-notes-local
description: Use when you need to read, search, create, update, move, delete, or deterministically export local Apple Notes on macOS, including stable full-library sync into a filesystem directory for version control.
license: MIT
allowed-tools: "Bash(npx:*), Bash(python3:*), Bash(uv:*)"
metadata:
  pattern: pipeline
  compatibility: "macOS only; requires Notes.app automation permission for Terminal/iTerm/Codex host process"
---

# labali-apple-notes-local

Deterministic local Apple Notes executor for macOS. It uses Notes.app automation through JXA (`osascript -l JavaScript`) and returns JSON for reliable downstream use.

Default operating mode is:
1. Read the request.
2. Translate it into one concrete action.
3. If the action is destructive, produce a preview plan first.
4. Execute only after explicit confirmation.

## NEVER

- **NEVER run on non-macOS**. This skill is Notes.app automation, not a cross-platform notes client.
- **NEVER auto-confirm destructive operations**. `delete-note`, `delete-folder`, `move-note`, and `rename-folder` must preview first unless `--confirm true` is passed explicitly.
- **NEVER guess between multiple note matches**. If title-based lookup is ambiguous, stop and return candidates.
- **NEVER assume title and body are fully independent in Apple Notes**. Notes can derive the visible title from body content. When both are updated, set body first and title second.
- **NEVER delete a non-empty folder in automation flow**. Empty it intentionally first or move notes elsewhere.

## Required Constraints

- Runtime must be macOS with Apple Notes available.
- The host process must already have Automation permission to control Notes.app.
- Output is JSON only.
- Folder paths use `/` separators, for example `iCloud/Work/Ideas`.
- Prefer note `id` over title-based matching whenever available.

## Runtime Inputs

**Required**
- `action` — one of:
  - `list-notes`
  - `get-note`
  - `search-notes`
  - `create-note`
  - `update-note`
  - `append-note`
  - `delete-note`
  - `list-folders`
  - `create-folder`
  - `rename-folder`
  - `move-note`
  - `delete-folder`
  - `export-note`
  - `export-all-notes`

**Common optional inputs**
- `note_id` — exact Apple Notes note identifier.
- `title` — note title for create or title-based lookup.
- `folder_path` — source folder path like `iCloud/Work`.
- `target_folder_path` — destination folder path for move or creation.
- `content` — plain-text content.
- `body_html` — explicit HTML body for create or update.
- `query` — search text for `search-notes`.
- `limit` — max returned notes for list/search.
- `output_dir` — required for `export-note` and `export-all-notes`.
- `confirm` — `true` to execute destructive actions after preview.

## Execution

```bash
npx tsx skills/private/labali-apple-notes-local/scripts/run.ts \
  --action list-notes \
  [--folder_path "iCloud/Work"] \
  [--limit 20]
```

Deterministic full-library export:

```bash
npx tsx skills/private/labali-apple-notes-local/scripts/run.ts \
  --action export-all-notes \
  --output_dir "/path/to/export-dir"
```

Destructive example:

```bash
npx tsx skills/private/labali-apple-notes-local/scripts/run.ts \
  --action delete-note \
  --note_id "x-coredata://..." 
```

The first run returns a preview plan. Execute only after review:

```bash
npx tsx skills/private/labali-apple-notes-local/scripts/run.ts \
  --action delete-note \
  --note_id "x-coredata://..." \
  --confirm true
```

## Action Rules

### Read operations

- `list-notes`: return note summaries, optionally scoped to a folder.
- `get-note`: return one note with body and plaintext.
- `search-notes`: case-insensitive search across title and plaintext.
- `list-folders`: return account and folder path inventory.
- `export-note`: export one note into `notes/<encoded-note-id>/note.json` and `note.md`.
- `export-all-notes`: full-library sync into a stable directory tree plus `manifest.json` and `summary.json`.
- Export actions exclude notes in `Recently Deleted`.

### Write operations

- `create-note`: create note in target folder. Provide `folder_path` or `target_folder_path`.
- `update-note`: replace note content. If both `body_html` and `content` are absent, fail.
- `update-note`: replace note content and preserve the current title unless a new title is provided.
- `append-note`: append plain text to the end of existing body.
- `create-folder`: create a folder under account root or nested parent path.

### Destructive or reclassification operations

- `delete-note`: preview first, then delete on `confirm=true`.
- `move-note`: preview first, then move on `confirm=true`.
- `rename-folder`: preview first, then rename on `confirm=true`.
- `delete-folder`: preview first, require empty folder, then delete on `confirm=true`.

## Lookup Rules

1. If `note_id` is provided, use it directly.
2. Otherwise require exact title match.
3. If `folder_path` is also provided, scope the match to that folder.
4. If more than one note matches, return `AMBIGUOUS_NOTE`.

## Output Shape

Successful and preview responses both return JSON with:

- `ok`
- `action`
- `mode` — `execute` or `preview`
- `data` or `plan`

Errors return JSON with:

- `ok: false`
- `action`
- `error`
- `details`

## Failure Modes and Remedies

| Symptom | Likely Cause | Remedy |
|---------|-------------|--------|
| `Automation permission denied` | Terminal process is not allowed to control Notes | Grant Automation permission in System Settings and retry |
| `AMBIGUOUS_NOTE` | Multiple notes share the same title | Re-run with `note_id` or `folder_path` |
| `FOLDER_NOT_EMPTY` | Folder still contains notes or child folders | Move or delete contents first |
| Title changes unexpectedly after content update | Apple Notes derived title from first body line | Set body first, then set explicit title |

## Stable Export Contract

- Stable source of truth is `notes/<encoded-note-id>/note.json`.
- Human-readable cache is `notes/<encoded-note-id>/note.md`.
- `encoded-note-id` is a deterministic filesystem-safe encoding of the raw Apple Notes id.
- `manifest.json` is deterministic and contains no export timestamp.
- `summary.json` is deterministic and reports `added / updated / removed` counts and ids for the last sync.
- Re-running `export-all-notes` with unchanged source notes must produce byte-identical outputs.
- Deleted notes are removed from the export tree on full-library sync.
- Notes currently in `Recently Deleted` are treated as deleted and must not be exported.

## Resources

| File | Purpose |
|------|---------|
| `references/architecture.md` | Execution model, lookup strategy, and Apple Notes behavior constraints |
| `references/plan.md` | Action-to-workflow map and safety gates |
| `scripts/apple-notes.py` | JSON CLI wrapper over Notes.app automation |
| `scripts/run.ts` | Runtime entry point and argument handling |

Load `references/architecture.md` when extending note identification, folder handling, or destructive safety rules.

## Success Criteria

1. The command validates required inputs before execution.
2. Read operations return deterministic JSON.
3. Destructive operations preview first by default.
4. Confirmed destructive operations execute exactly once.
5. Folder and note lookup failures return explicit machine-readable errors.
6. Full export uses note id as the only filesystem identity key.
7. Full export removes stale note directories and rewrites `manifest.json` deterministically.
