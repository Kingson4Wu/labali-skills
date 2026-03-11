#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run.ts"
SCRIPT="$ROOT_DIR/scripts/transcribe-media.sh"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"
OPENAI_YAML="$ROOT_DIR/agents/openai.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$SCRIPT" ]] || { echo "Missing transcribe-media.sh"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }
[[ -f "$OPENAI_YAML" ]] || { echo "Missing agents/openai.yaml"; exit 1; }

rg -n "Whisper|video|ffmpeg|language|deterministic" "$SKILL_MD" >/dev/null
rg -n "input_path|output_text|language|model|task|output_format|parallel|retry|dry_run|force" "$SKILL_YAML" >/dev/null
rg -n -- "--input_path|--output_text|--language|--model|--task|--output_format|--parallel|--retry|--dry_run|--force" "$RUNNER" >/dev/null
rg -n -- "--input|--output|--language|--model|--task|--output-format|whisper|ffmpeg|_subtitles" "$SCRIPT" >/dev/null

bash "$SCRIPT" --help >/dev/null
npx tsx "$RUNNER" --help >/dev/null

echo "Regression checks passed"
