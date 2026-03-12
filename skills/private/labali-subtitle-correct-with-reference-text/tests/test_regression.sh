#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run.ts"
PY_SCRIPT="$ROOT_DIR/scripts/fix-subtitle-with-reference.py"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"
OPENAI_YAML="$ROOT_DIR/agents/openai.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$PY_SCRIPT" ]] || { echo "Missing fix-subtitle-with-reference.py"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }
[[ -f "$OPENAI_YAML" ]] || { echo "Missing agents/openai.yaml"; exit 1; }

rg -n "Required Constraints|Execution|Success Criteria" "$SKILL_MD" >/dev/null
rg -n -- "--subtitle_path|--reference_path|--output_path" "$RUNNER" >/dev/null
rg -n "subtitle_path|reference_path|output_path|.srt|.vtt" "$PY_SCRIPT" "$SKILL_YAML" >/dev/null

echo "Regression checks passed"
