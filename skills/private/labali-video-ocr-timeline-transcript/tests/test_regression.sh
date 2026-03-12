#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run.ts"
SCRIPT="$ROOT_DIR/scripts/video-ocr-timeline.py"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"
OPENAI_YAML="$ROOT_DIR/agents/openai.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$SCRIPT" ]] || { echo "Missing video-ocr-timeline.py"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }
[[ -f "$OPENAI_YAML" ]] || { echo "Missing agents/openai.yaml"; exit 1; }

rg -n "ffmpeg|Vision|timestamp|chunk|Codex|Gemini" "$SKILL_MD" >/dev/null
rg -n "video_path|adaptive_mode|fps|scene|max_gap|languages|recognition_level|chunk_size|chunk_overlap|merge_similarity|merge_max_gap|debug|cleanup_frames" "$SKILL_YAML" >/dev/null
rg -n -- "--video_path|--output_dir|--adaptive_mode|--fps|--scene|--max_gap|--languages|--recognition_level|--chunk_size|--chunk_overlap|--merge_similarity|--merge_max_gap|--debug|--cleanup_frames" "$RUNNER" >/dev/null
rg -n "showinfo|pts_time|choose_smart_params|merge_duplicate_frames|merged_timeline|cleanup_intermediate_outputs|final_transcript" "$SCRIPT" >/dev/null

python3 "$SCRIPT" --help >/dev/null
npx tsx "$RUNNER" --help >/dev/null

echo "Regression checks passed"
