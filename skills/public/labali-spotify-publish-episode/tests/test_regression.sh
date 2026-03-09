#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXECUTOR="$ROOT_DIR/scripts/executor.ts"
AUTO_EXECUTOR="$ROOT_DIR/scripts/auto-executor.ts"
RUNNER="$ROOT_DIR/scripts/run.ts"
DET_RUNNER="$ROOT_DIR/scripts/run_deterministic.ts"
DET_EXECUTOR="$ROOT_DIR/scripts/deterministic.ts"
SCRIPTS_DIR="$ROOT_DIR/scripts"
PLAN="$ROOT_DIR/references/plan.md"
ARCH="$ROOT_DIR/references/architecture.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"
SKILL_MD="$ROOT_DIR/SKILL.md"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$EXECUTOR" ]] || { echo "Missing executor.ts"; exit 1; }
[[ -f "$AUTO_EXECUTOR" ]] || { echo "Missing auto-executor.ts"; exit 1; }
[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$DET_RUNNER" ]] || { echo "Missing run_deterministic.ts"; exit 1; }
[[ -f "$DET_EXECUTOR" ]] || { echo "Missing deterministic.ts"; exit 1; }
[[ -f "$PLAN" ]] || { echo "Missing references/plan.md"; exit 1; }
[[ -f "$ARCH" ]] || { echo "Missing references/architecture.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }

# Keep semantic-action policy for the primary executor path:
# no xpath/CSS-id/querySelector reliance outside deterministic trajectory cache.
if rg -n "xpath=|#[-_a-zA-Z0-9]+|querySelector\(" "$SCRIPTS_DIR" \
  --glob '!deterministic.ts' --glob '!run_deterministic.ts' >/dev/null; then
  echo "Executor appears to rely on fragile selectors."
  exit 1
fi

# Ensure publish safety guard is present.
rg -n "confirm_publish" "$SCRIPTS_DIR" >/dev/null
rg -n "Publish date\\*\\(required\\)|publish-date-now|verifyPublishedInList|Search episode titles" "$SCRIPTS_DIR" >/dev/null
rg -n -- "--audio_file|--title|--description|--show_name|--season_number|--episode_number|--confirm_publish|--disable_deterministic_cache|--cdp_port|--show_home_url" "$RUNNER" >/dev/null
rg -n -- "--audio_file|--title|--description|--show_name|--season_number|--episode_number|--cdp_port|--show_home_url" "$DET_RUNNER" >/dev/null

# Ensure required inputs are documented.
rg -n "audio_file|title|description|show_name|season_number|episode_number|disable_deterministic_cache|confirm_publish|cdp_port|show_home_url" "$SKILL_YAML" >/dev/null

# Enforce layer boundary docs.
rg -n "Layer Contract|Success Criteria|Operational Mode" "$SKILL_MD" >/dev/null
rg -n "Layered Boundaries|Execution Model|Publish Correctness Standards" "$ARCH" >/dev/null
rg -n "auto-executor|deterministic|policy executor|downgrade" "$SKILL_MD" "$ARCH" "$PLAN" >/dev/null

echo "Regression checks passed"
