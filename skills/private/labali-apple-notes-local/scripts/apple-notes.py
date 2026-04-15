#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
from urllib.parse import quote
from pathlib import Path

DESTRUCTIVE_ACTIONS = {"delete-note", "move-note", "rename-folder", "delete-folder"}
EXPORT_ACTIONS = {"export-note", "export-all-notes"}
VALID_ACTIONS = {
    "append-note",
    "create-folder",
    "create-note",
    "delete-folder",
    "delete-note",
    "export-all-notes",
    "export-note",
    "get-note",
    "list-folders",
    "list-notes",
    "move-note",
    "rename-folder",
    "search-notes",
    "update-note",
}
NOTE_RECORD_KEYS = (
    "id",
    "title",
    "account",
    "folder_path",
    "created_at",
    "updated_at",
    "plaintext",
    "body_html",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Operate local Apple Notes through Notes.app automation."
    )
    parser.add_argument("--action", required=True, choices=sorted(VALID_ACTIONS))
    parser.add_argument("--note-id", required=False)
    parser.add_argument("--title", required=False)
    parser.add_argument("--folder-path", required=False)
    parser.add_argument("--target-folder-path", required=False)
    parser.add_argument("--content", required=False)
    parser.add_argument("--body-html", required=False)
    parser.add_argument("--query", required=False)
    parser.add_argument("--output-dir", required=False)
    parser.add_argument("--limit", type=int, required=False, default=50)
    parser.add_argument("--confirm", required=False, default="false")
    return parser.parse_args()


def ensure_macos() -> None:
    if platform.system() != "Darwin":
        raise RuntimeError("This skill only supports macOS (Darwin).")


def parse_bool(raw: str) -> bool:
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    raise ValueError(f"Invalid boolean value: {raw}")


def html_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def yaml_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def build_body_html(title: str | None, content: str | None, body_html: str | None) -> str:
    if body_html and body_html.strip():
        return body_html.strip()
    if content is None:
        raise ValueError("Either --content or --body-html is required for this action.")

    lines = content.splitlines() or [content]
    body_parts: list[str] = []
    if title and title.strip():
        body_parts.append(f"<div>{html_escape(title.strip())}</div>")
        body_parts.append("<div><br></div>")
    for line in lines:
        if line:
            body_parts.append(f"<div>{html_escape(line)}</div>")
        else:
            body_parts.append("<div><br></div>")
    return "\n".join(body_parts)


def emit(payload: dict) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def fail(action: str, error: str, details: str) -> int:
    print(
        json.dumps(
            {"ok": False, "action": action, "error": error, "details": details},
            ensure_ascii=False,
            indent=2,
        ),
        file=sys.stderr,
    )
    return 1


def preview_payload(args: argparse.Namespace) -> dict:
    summary = {
        "note_id": args.note_id,
        "title": args.title,
        "folder_path": args.folder_path,
        "target_folder_path": args.target_folder_path,
    }
    return {
        "ok": True,
        "action": args.action,
        "mode": "preview",
        "plan": {
            "requires_confirmation": True,
            "summary": f"Preview only. Re-run with --confirm true to execute {args.action}.",
            "inputs": {k: v for k, v in summary.items() if v},
        },
    }


def validate_args(args: argparse.Namespace) -> None:
    action = args.action
    if action in {
        "append-note",
        "delete-note",
        "export-note",
        "get-note",
        "move-note",
        "update-note",
    } and not args.note_id and not args.title:
        raise ValueError(f"{action} requires --note-id or --title.")
    if action == "search-notes" and not args.query:
        raise ValueError("search-notes requires --query.")
    if action in {"create-note", "update-note"} and not (args.content or args.body_html):
        raise ValueError(f"{action} requires --content or --body-html.")
    if action == "create-note" and not (args.folder_path or args.target_folder_path):
        raise ValueError("create-note requires --folder-path or --target-folder-path.")
    if action == "append-note" and not args.content:
        raise ValueError("append-note requires --content.")
    if action in {"create-folder", "delete-folder", "rename-folder"} and not args.folder_path:
        raise ValueError(f"{action} requires --folder-path.")
    if action == "move-note" and not args.target_folder_path:
        raise ValueError("move-note requires --target-folder-path.")
    if action == "rename-folder" and not args.title:
        raise ValueError("rename-folder requires --title as the new folder name.")
    if action in EXPORT_ACTIONS and not args.output_dir:
        raise ValueError(f"{action} requires --output-dir.")
    if args.limit is not None and args.limit <= 0:
        raise ValueError("--limit must be greater than 0.")


def to_js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def canonical_note_record(note: dict) -> dict:
    return {key: note.get(key) for key in NOTE_RECORD_KEYS}


def note_dir_name(note_id: str) -> str:
    return quote(note_id, safe="")


def render_note_markdown(note: dict) -> str:
    title = note.get("title") or "Untitled"
    body = (note.get("plaintext") or "").rstrip()
    lines = [
        "---",
        f'id: "{yaml_escape(note["id"])}"',
        f'title: "{yaml_escape(title)}"',
        f'account: "{yaml_escape(note.get("account") or "")}"',
        f'folder_path: "{yaml_escape(note.get("folder_path") or "")}"',
        f'created_at: "{yaml_escape(note.get("created_at") or "")}"',
        f'updated_at: "{yaml_escape(note.get("updated_at") or "")}"',
        "generated_from: note.json",
        "---",
        "",
        f"# {title}",
        "",
    ]
    if body:
        lines.append(body)
        lines.append("")
    return "\n".join(lines)


def write_export_tree(notes: list[dict], output_dir: str) -> dict:
    root = Path(output_dir).expanduser().resolve()
    notes_root = root / "notes"
    notes_root.mkdir(parents=True, exist_ok=True)

    canonical_notes = [canonical_note_record(note) for note in notes]
    canonical_notes.sort(key=lambda item: item["id"])
    active_dir_names = {note_dir_name(note["id"]) for note in canonical_notes}
    previous_json_by_dir: dict[str, str] = {}
    if notes_root.exists():
        for child in sorted(notes_root.iterdir(), key=lambda item: item.name):
            if not child.is_dir():
                continue
            note_json_path = child / "note.json"
            if note_json_path.exists():
                previous_json_by_dir[child.name] = note_json_path.read_text(encoding="utf-8")

    added_ids: list[str] = []
    updated_ids: list[str] = []

    for note in canonical_notes:
        dir_name = note_dir_name(note["id"])
        note_dir = notes_root / dir_name
        note_dir.mkdir(parents=True, exist_ok=True)
        note_json_content = json.dumps(note, ensure_ascii=False, indent=2) + "\n"
        previous_json = previous_json_by_dir.get(dir_name)
        if previous_json is None:
            added_ids.append(note["id"])
        elif previous_json != note_json_content:
            updated_ids.append(note["id"])
        (note_dir / "note.json").write_text(note_json_content, encoding="utf-8")
        (note_dir / "note.md").write_text(
            render_note_markdown(note),
            encoding="utf-8",
        )

    removed_ids: list[str] = []
    for child in sorted(notes_root.iterdir(), key=lambda item: item.name):
        if not child.is_dir():
            continue
        if child.name not in active_dir_names:
            shutil.rmtree(child)
            removed_ids.append(child.name)

    manifest = {
        "schema_version": 1,
        "note_count": len(canonical_notes),
        "note_ids": [note["id"] for note in canonical_notes],
        "notes": [
            {
                "id": note["id"],
                "title": note["title"],
                "account": note["account"],
                "folder_path": note["folder_path"],
                "updated_at": note["updated_at"],
                "dir_name": note_dir_name(note["id"]),
            }
            for note in canonical_notes
        ],
    }
    (root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    summary = {
        "schema_version": 1,
        "note_count": len(canonical_notes),
        "added_count": len(added_ids),
        "updated_count": len(updated_ids),
        "removed_count": len(removed_ids),
        "added_ids": added_ids,
        "updated_ids": updated_ids,
        "removed_dir_names": removed_ids,
    }
    (root / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return {
        "outputDir": str(root),
        "notesDir": str(notes_root),
        "noteCount": len(canonical_notes),
        "noteIds": manifest["note_ids"],
        "addedCount": len(added_ids),
        "updatedCount": len(updated_ids),
        "removedIds": removed_ids,
        "manifestPath": str(root / "manifest.json"),
        "summaryPath": str(root / "summary.json"),
    }


def run_jxa(payload: dict) -> dict:
    script = f"""
function ok(action, mode, data) {{
  return {{ ok: true, action, mode, data }};
}}

function fail(action, error, details, extra) {{
  const out = Object.assign({{ ok: false, action, error, details }}, extra || {{}});
  return out;
}}

function folderPathParts(rawPath) {{
  return String(rawPath).split('/').map((part) => part.trim()).filter(Boolean);
}}

function simpleFolder(folder, accountName, parentPath) {{
  const currentPath = parentPath ? `${{parentPath}}/${{folder.name()}}` : `${{accountName}}/${{folder.name()}}`;
  return {{
    id: folder.id(),
    name: folder.name(),
    account: accountName,
    path: currentPath,
    noteCount: folder.notes().length,
    childFolderCount: folder.folders().length,
  }};
}}

function collectFolders(folder, accountName, parentPath, out) {{
  out.push(simpleFolder(folder, accountName, parentPath));
  const nextParent = parentPath ? `${{parentPath}}/${{folder.name()}}` : `${{accountName}}/${{folder.name()}}`;
  for (const child of folder.folders()) {{
    collectFolders(child, accountName, nextParent, out);
  }}
}}

function listAllFolders(app) {{
  const rows = [];
  for (const account of app.accounts()) {{
    const accountName = account.name();
    for (const folder of account.folders()) {{
      collectFolders(folder, accountName, "", rows);
    }}
  }}
  return rows;
}}

function resolveFolder(app, rawPath) {{
  const parts = folderPathParts(rawPath);
  if (parts.length < 2) {{
    throw new Error(`Folder path must include account and folder: ${{rawPath}}`);
  }}
  const accountName = parts[0];
  const account = app.accounts.byName(accountName);
  if (!account.exists()) {{
    throw new Error(`Account not found: ${{accountName}}`);
  }}
  let current = account.folders.byName(parts[1]);
  if (!current.exists()) {{
    throw new Error(`Folder not found: ${{accountName}}/${{parts[1]}}`);
  }}
  for (let i = 2; i < parts.length; i += 1) {{
    current = current.folders.byName(parts[i]);
    if (!current.exists()) {{
      throw new Error(`Folder not found: ${{parts.slice(0, i + 1).join('/')}}`);
    }}
  }}
  return current;
}}

function ensureParentFolder(app, rawPath) {{
  const parts = folderPathParts(rawPath);
  if (parts.length < 2) {{
    throw new Error(`Folder path must include account and folder: ${{rawPath}}`);
  }}
  const accountName = parts[0];
  const account = app.accounts.byName(accountName);
  if (!account.exists()) {{
    throw new Error(`Account not found: ${{accountName}}`);
  }}
  let parent = account;
  let current = null;
  for (let i = 1; i < parts.length; i += 1) {{
    const name = parts[i];
    if (i === 1) {{
      current = parent.folders.byName(name);
      if (!current.exists()) {{
        current = app.Folder({{ name }});
        parent.folders.push(current);
      }}
    }} else {{
      let next = current.folders.byName(name);
      if (!next.exists()) {{
        next = app.Folder({{ name }});
        current.folders.push(next);
      }}
      current = next;
    }}
    parent = current;
  }}
  return current;
}}

function noteSummary(note, folderPath) {{
  const plain = String(note.plaintext() || "");
  return {{
    id: note.id(),
    title: note.name(),
    folderPath,
    createdAt: note.creationDate(),
    updatedAt: note.modificationDate(),
    plaintextPreview: plain.slice(0, 200),
  }};
}}

function fullNoteRecord(note, folderPath) {{
  const account = folderPath ? folderPath.split('/')[0] : null;
  return {{
    id: note.id(),
    title: note.name(),
    account,
    folder_path: folderPath,
    created_at: note.creationDate(),
    updated_at: note.modificationDate(),
    plaintext: String(note.plaintext() || ''),
    body_html: String(note.body() || ''),
  }};
}}

function scanFolderNotes(folder, accountName, parentPath, out) {{
  const folderPath = parentPath ? `${{parentPath}}/${{folder.name()}}` : `${{accountName}}/${{folder.name()}}`;
  for (const note of folder.notes()) {{
    out.push({{ note, folderPath }});
  }}
  for (const child of folder.folders()) {{
    scanFolderNotes(child, accountName, folderPath, out);
  }}
}}

function allNotes(app) {{
  const out = [];
  for (const account of app.accounts()) {{
    const accountName = account.name();
    for (const folder of account.folders()) {{
      scanFolderNotes(folder, accountName, "", out);
    }}
  }}
  return out;
}}

function isDeletedFolderPath(folderPath) {{
  return String(folderPath || '').split('/').map((part) => part.trim()).includes('Recently Deleted');
}}

function exportableNotes(app) {{
  return allNotes(app).filter((row) => !isDeletedFolderPath(row.folderPath));
}}

function resolveNote(app, noteId, title, folderPath) {{
  if (noteId) {{
    const note = app.notes.byId(noteId);
    if (!note.exists()) {{
      throw new Error(`Note id not found: ${{noteId}}`);
    }}
    const scanned = allNotes(app).find((row) => row.note.id() === noteId);
    return {{
      note,
      folderPath: scanned ? scanned.folderPath : null,
    }};
  }}

  const matches = allNotes(app).filter((row) => {{
    if (row.note.name() !== title) return false;
    if (folderPath && row.folderPath !== folderPath) return false;
    return true;
  }});

  if (matches.length === 0) {{
    throw new Error(`Note not found for title: ${{title}}`);
  }}
  if (matches.length > 1) {{
    throw new Error(JSON.stringify({{
      code: 'AMBIGUOUS_NOTE',
      candidates: matches.map((row) => noteSummary(row.note, row.folderPath)),
    }}));
  }}
  return matches[0];
}}

function maybeJsonError(action, error) {{
  try {{
    const parsed = JSON.parse(String(error.message || error));
    if (parsed && parsed.code === 'AMBIGUOUS_NOTE') {{
      return fail(action, parsed.code, 'Multiple notes matched the requested title.', {{
        candidates: parsed.candidates,
      }});
    }}
  }} catch (inner) {{}}
  return null;
}}

function main() {{
  const input = {to_js_string(json.dumps(payload, ensure_ascii=False))};
  const params = JSON.parse(input);
  const action = params.action;
  const app = Application('Notes');

  try {{
    if (action === 'list-folders') {{
      return ok(action, 'execute', {{ folders: listAllFolders(app) }});
    }}

    if (action === 'list-notes') {{
      const rows = folderPathParts(params.folder_path || '').length
        ? allNotes(app).filter((row) => row.folderPath === params.folder_path)
        : allNotes(app);
      const limit = Number(params.limit || 50);
      return ok(action, 'execute', {{
        notes: rows.slice(0, limit).map((row) => noteSummary(row.note, row.folderPath)),
        total: rows.length,
      }});
    }}

    if (action === 'search-notes') {{
      const query = String(params.query || '').toLowerCase();
      const rows = allNotes(app).filter((row) => {{
        const title = String(row.note.name() || '').toLowerCase();
        const plain = String(row.note.plaintext() || '').toLowerCase();
        return title.includes(query) || plain.includes(query);
      }});
      const limit = Number(params.limit || 50);
      return ok(action, 'execute', {{
        notes: rows.slice(0, limit).map((row) => noteSummary(row.note, row.folderPath)),
        total: rows.length,
      }});
    }}

    if (action === 'get-note' || action === 'export-note') {{
      const resolved = resolveNote(app, params.note_id, params.title, params.folder_path);
      if (action === 'export-note' && isDeletedFolderPath(resolved.folderPath)) {{
        return fail(action, 'NOTE_IN_RECENTLY_DELETED', 'Refusing to export a note from Recently Deleted.');
      }}
      return ok(action, 'execute', {{
        note: fullNoteRecord(resolved.note, resolved.folderPath),
      }});
    }}

    if (action === 'export-all-notes') {{
      return ok(action, 'execute', {{
        notes: exportableNotes(app).map((row) => fullNoteRecord(row.note, row.folderPath)),
      }});
    }}

    if (action === 'create-folder') {{
      const folder = ensureParentFolder(app, params.folder_path);
      return ok(action, 'execute', {{
        folder: {{
          id: folder.id(),
          name: folder.name(),
          path: params.folder_path,
        }},
      }});
    }}

    if (action === 'create-note') {{
      const destination = params.target_folder_path
        ? ensureParentFolder(app, params.target_folder_path)
        : ensureParentFolder(app, params.folder_path);
      const note = app.Note({{ body: params.body_html }});
      destination.notes.push(note);
      const created = destination.notes()[destination.notes().length - 1];
      if (params.title) {{
        created.name = params.title;
      }}
      return ok(action, 'execute', {{
        note: {{
          id: created.id(),
          title: created.name(),
          folderPath: params.target_folder_path || params.folder_path || null,
        }},
      }});
    }}

    if (action === 'update-note') {{
      const resolved = resolveNote(app, params.note_id, params.title_lookup, params.folder_path);
      const note = app.notes.byId(resolved.note.id());
      const preservedTitle = note.name();
      note.body = params.body_html;
      note.name = params.title || preservedTitle;
      return ok(action, 'execute', {{
        note: {{
          id: note.id(),
          title: note.name(),
          folderPath: resolved.folderPath,
        }},
      }});
    }}

    if (action === 'append-note') {{
      const resolved = resolveNote(app, params.note_id, params.title, params.folder_path);
      const note = app.notes.byId(resolved.note.id());
      const body = String(note.body() || '').trim();
      const appendHtml = `<div><br></div><div>${{String(params.content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}}</div>`;
      note.body = `${{body}}\\n${{appendHtml}}`;
      return ok(action, 'execute', {{
        note: {{
          id: note.id(),
          title: note.name(),
          folderPath: resolved.folderPath,
        }},
      }});
    }}

    if (action === 'delete-note') {{
      const resolved = resolveNote(app, params.note_id, params.title, params.folder_path);
      const deleted = {{
        id: resolved.note.id(),
        title: resolved.note.name(),
        folderPath: resolved.folderPath,
      }};
      resolved.note.delete();
      return ok(action, 'execute', {{ deleted }});
    }}

    if (action === 'move-note') {{
      const resolved = resolveNote(app, params.note_id, params.title, params.folder_path);
      const target = resolveFolder(app, params.target_folder_path);
      resolved.note.move({{ to: target }});
      const moved = app.notes.byId(resolved.note.id());
      return ok(action, 'execute', {{
        note: {{
          id: moved.id(),
          title: moved.name(),
          folderPath: params.target_folder_path,
        }},
      }});
    }}

    if (action === 'rename-folder') {{
      const folder = resolveFolder(app, params.folder_path);
      folder.name = params.title;
      return ok(action, 'execute', {{
        folder: {{
          id: folder.id(),
          name: folder.name(),
        }},
      }});
    }}

    if (action === 'delete-folder') {{
      const folder = resolveFolder(app, params.folder_path);
      if (folder.notes().length > 0 || folder.folders().length > 0) {{
        return fail(action, 'FOLDER_NOT_EMPTY', 'Folder still contains notes or child folders.');
      }}
      folder.delete();
      return ok(action, 'execute', {{
        deleted: {{
          path: params.folder_path,
        }},
      }});
    }}

    return fail(action, 'UNKNOWN_ACTION', `Unhandled action: ${{action}}`);
  }} catch (error) {{
    return maybeJsonError(action, error) || fail(action, 'NOTES_AUTOMATION_ERROR', String(error.message || error));
  }}
}}

JSON.stringify(main());
"""

    result = subprocess.run(
        ["osascript", "-l", "JavaScript"],
        input=script,
        text=True,
        capture_output=True,
    )

    combined = (result.stdout or "").strip() or (result.stderr or "").strip()
    if result.returncode != 0:
        raise RuntimeError(combined or "Unknown Notes automation failure.")
    if not combined:
        raise RuntimeError("No JSON output returned from Notes automation.")
    return json.loads(combined)


def main() -> int:
    args = parse_args()
    ensure_macos()
    validate_args(args)

    confirm = parse_bool(args.confirm)
    if args.action in DESTRUCTIVE_ACTIONS and not confirm:
        return emit(preview_payload(args))

    title_lookup = None if args.note_id else args.title
    body_html = args.body_html
    if args.action in {"create-note", "update-note"}:
        body_html = build_body_html(
            title=args.title if args.action == "create-note" else None,
            content=args.content,
            body_html=args.body_html,
        )

    payload = {
        "action": args.action,
        "note_id": args.note_id,
        "title": args.title,
        "title_lookup": title_lookup,
        "folder_path": args.folder_path,
        "target_folder_path": args.target_folder_path,
        "body_html": body_html,
        "content": args.content,
        "query": args.query,
        "limit": args.limit,
    }

    response = run_jxa(payload)
    if not response.get("ok"):
        print(json.dumps(response, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    if args.action == "export-note":
        note = response["data"]["note"]
        export_data = write_export_tree([note], args.output_dir)
        response["data"] = {
            "export": export_data,
            "note": canonical_note_record(note),
        }
    elif args.action == "export-all-notes":
        notes = response["data"]["notes"]
        export_data = write_export_tree(notes, args.output_dir)
        response["data"] = {"export": export_data}

    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(fail("unknown", "PYTHON_WRAPPER_ERROR", str(exc)))
