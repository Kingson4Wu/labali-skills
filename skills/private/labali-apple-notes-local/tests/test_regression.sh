#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run.ts"
PY_SCRIPT="$ROOT_DIR/scripts/apple-notes.py"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"
OPENAI_YAML="$ROOT_DIR/agents/openai.yaml"
ARCH_REF="$ROOT_DIR/references/architecture.md"
PLAN_REF="$ROOT_DIR/references/plan.md"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$PY_SCRIPT" ]] || { echo "Missing apple-notes.py"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }
[[ -f "$OPENAI_YAML" ]] || { echo "Missing agents/openai.yaml"; exit 1; }
[[ -f "$ARCH_REF" ]] || { echo "Missing references/architecture.md"; exit 1; }
[[ -f "$PLAN_REF" ]] || { echo "Missing references/plan.md"; exit 1; }

python3 "$PY_SCRIPT" --help >/dev/null

rg -n "delete-note|move-note|rename-folder|delete-folder" "$SKILL_MD" "$PLAN_REF" >/dev/null
rg -n "export-note|export-all-notes|output_dir|manifest.json|summary.json|notes/<encoded-note-id>/note.json|filesystem-safe encoding" "$SKILL_MD" "$SKILL_YAML" "$PLAN_REF" "$ARCH_REF" >/dev/null
rg -n "Recently Deleted|NOTE_IN_RECENTLY_DELETED" "$SKILL_MD" "$PY_SCRIPT" "$PLAN_REF" "$ARCH_REF" >/dev/null
rg -n "Preview only|confirm=true|requires_confirmation" "$SKILL_MD" "$PY_SCRIPT" >/dev/null
rg -n "list-notes|get-note|search-notes|create-note|update-note|append-note|list-folders|create-folder|export-note|export-all-notes|output-dir" "$SKILL_MD" "$RUNNER" "$PY_SCRIPT" >/dev/null
rg -n "title and body are not fully independent|write body first and title second" "$SKILL_MD" "$ARCH_REF" "$PLAN_REF" >/dev/null

echo "Regression checks passed"
