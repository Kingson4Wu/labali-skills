#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run.ts"
SCRIPT="$ROOT_DIR/scripts/sanitize-video.sh"
CHECK_SCRIPT="$ROOT_DIR/scripts/check-sensitive-video-info.sh"
ARCH="$ROOT_DIR/references/architecture.md"
PLAN="$ROOT_DIR/references/plan.md"
RISK_NOTES="$ROOT_DIR/references/risk-notes.md"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$SCRIPT" ]] || { echo "Missing sanitize-video.sh"; exit 1; }
[[ -f "$CHECK_SCRIPT" ]] || { echo "Missing check-sensitive-video-info.sh"; exit 1; }
[[ -f "$ARCH" ]] || { echo "Missing references/architecture.md"; exit 1; }
[[ -f "$PLAN" ]] || { echo "Missing references/plan.md"; exit 1; }
[[ -f "$RISK_NOTES" ]] || { echo "Missing references/risk-notes.md"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }

rg -n "Layer Contract|Required Constraints|Success Criteria|Operational Mode" "$SKILL_MD" >/dev/null
rg -n "Layered Boundaries|Execution Model|Safety Notes" "$ARCH" >/dev/null
rg -n "Known Gaps|High-Assurance Alternative|practical desensitization" "$RISK_NOTES" >/dev/null
rg -n "map_metadata -1|map_chapters -1|fflags \+bitexact|flags:v \+bitexact|flags:a \+bitexact|c:v libx264|crf 18|c:a aac|movflags \+faststart|write_tmcd 0|ffprobe Format Tag Diff|intermediate|mandatory two-pass|Pass 1" "$SCRIPT" "$PLAN" >/dev/null
rg -n "Sensitive info review|MODEL_REVIEW_SUMMARY|MODEL_REVIEW_JSON_BEGIN|MODEL_REVIEW_JSON_END|Strict mode gate" "$CHECK_SCRIPT" >/dev/null
rg -n -- "--input_video|--output_video|--strict" "$RUNNER" >/dev/null

echo "Regression checks passed"
