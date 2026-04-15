# Workflow Plan

1. Validate runtime is macOS.
2. Validate `action` and required action-specific inputs.
3. Resolve target folder or note deterministically.
4. If action is destructive:
   - return preview plan when `confirm` is absent or false
   - execute only when `confirm=true`
5. If action is export:
   - write note-id-based files under `output_dir`
   - write deterministic `note.json`, `note.md`, `manifest.json`, and `summary.json`
   - remove stale note directories on full export
   - exclude notes located in `Recently Deleted`
6. Return JSON result with explicit action and mode.

## Destructive Actions

- `delete-note`
- `move-note`
- `rename-folder`
- `delete-folder`

## Export Actions

- `export-note`
- `export-all-notes`

## Special Rule

When updating note content and title together, write body first and title second because Apple Notes may derive the title from the new body.

## Export Rule

Filesystem identity is note id only. Titles and folder paths belong in file contents and manifest data, not in paths. When writing to disk, use the deterministic filesystem-safe encoding of the raw note id as the directory name.
