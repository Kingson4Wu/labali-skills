#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run.ts"
SCRIPT="$ROOT_DIR/scripts/sanitize-image.sh"
CHECK_SCRIPT="$ROOT_DIR/scripts/check-sensitive-info.sh"
ARCH="$ROOT_DIR/references/architecture.md"
PLAN="$ROOT_DIR/references/plan.md"
MODEL_REVIEW="$ROOT_DIR/references/model-review.md"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$SCRIPT" ]] || { echo "Missing sanitize-image.sh"; exit 1; }
[[ -f "$CHECK_SCRIPT" ]] || { echo "Missing check-sensitive-info.sh"; exit 1; }
[[ -f "$ARCH" ]] || { echo "Missing references/architecture.md"; exit 1; }
[[ -f "$PLAN" ]] || { echo "Missing references/plan.md"; exit 1; }
[[ -f "$MODEL_REVIEW" ]] || { echo "Missing references/model-review.md"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }

rg -n "Layer Contract|Success Criteria|Operational Mode" "$SKILL_MD" >/dev/null
rg -n "Layered Boundaries|Execution Model|re-encode|metadata-only|no external API" "$ARCH" >/dev/null
rg -n "resize 99%|resize 101%|strip|quality 90|EXIF Diff|SHA256|magick|exiftool|Post-Sanitize Hidden Metadata Sensitive-Info Scan|In-Agent Model Judgment|Optional Strict Gate" "$SCRIPT" "$PLAN" >/dev/null
rg -n "Sensitive info review|hidden metadata|EXIF/XMP/IPTC|SENSITIVE_META_KEY_PATTERN|MODEL_REVIEW_SUMMARY|MODEL_REVIEW_JSON_BEGIN|MODEL_REVIEW_JSON_END|Strict mode gate" "$CHECK_SCRIPT" "$SKILL_MD" >/dev/null
rg -n "PASS|REVIEW_REQUIRED|BLOCK|Decision Rules|Output Format|Strict Mode Interaction" "$MODEL_REVIEW" >/dev/null
rg -n -- "--input_image|--output_image|--strict" "$RUNNER" >/dev/null

echo "Regression checks passed"
