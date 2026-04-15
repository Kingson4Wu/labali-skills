# Architecture

## Layered Boundaries

- Policy layer: `SKILL.md`
- Strategy layer: `references/*.md`
- Execution layer: `scripts/run.ts` + `scripts/apple-notes.py`

## Execution Model

1. Parse a single concrete action from runtime inputs.
2. Validate required arguments before talking to Notes.app.
3. Resolve folders and notes deterministically.
4. For destructive operations, return preview mode unless `confirm=true`.
5. For export operations, serialize notes into stable note-id-based files.
6. Execute through JXA and return JSON.

## Note Identity Strategy

- First choice: `note_id`
- Second choice: exact `title` + optional `folder_path`
- Never auto-pick from multiple title matches
- Export identity is always note id, never title or folder path

## Folder Strategy

- Folder paths are slash-separated and account-qualified.
- Paths are resolved recursively from account root.
- `delete-folder` is allowed only for empty folders.
- Folder moves should update exported note metadata, not filesystem identity

## Export Serialization Strategy

- Stable source file: `notes/<encoded-note-id>/note.json`
- Human-readable cache: `notes/<encoded-note-id>/note.md`
- Stable index: `manifest.json`
- Stable sync report: `summary.json`
- `encoded-note-id` is the raw note id percent-encoded for filesystem safety.
- Full export sorts notes by id before writing.
- `manifest.json` and `summary.json` must not contain export timestamps or other unstable fields.
- Full export removes note directories that no longer exist in Apple Notes.
- Full export excludes notes in `Recently Deleted`.

## Apple Notes Behavior Constraint

Apple Notes title and body are not fully independent in automation. Updating the body can cause Notes to derive a new visible title from the first rendered line. The safe order for updates is:

1. Write body
2. Reapply explicit title if caller provided one, otherwise reapply the preserved previous title

Keep this rule in both docs and code.
