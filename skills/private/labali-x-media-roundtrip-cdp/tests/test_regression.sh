#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/run.ts"
LAUNCHER="$ROOT_DIR/scripts/launch-chrome-cdp.sh"
ARCH="$ROOT_DIR/references/architecture.md"
PLAN="$ROOT_DIR/references/plan.md"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$LAUNCHER" ]] || { echo "Missing launch-chrome-cdp.sh"; exit 1; }
[[ -f "$ARCH" ]] || { echo "Missing references/architecture.md"; exit 1; }
[[ -f "$PLAN" ]] || { echo "Missing references/plan.md"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }

rg -n "agent browser \+ CDP|temporary post|delete|precheck|login status" "$SKILL_MD" >/dev/null
rg -n "Layered Boundaries|Execution Model|Safety Notes" "$ARCH" >/dev/null
rg -n "Runtime Precheck|Upload and Publish|Capture and Download|Cleanup" "$PLAN" >/dev/null
rg -n "open -na \"Google Chrome\" --args --remote-debugging-port|--user-data-dir" "$LAUNCHER" "$SKILL_MD" >/dev/null
rg -n "upload_media|publish_temp_post|capture_media_url|download_media|delete_temp_post|isCdpEndpointReady|ensureChromeWithCdp|isLoginRequired|ensureComposeReady|publishTemporaryPost|extractStatusIdFromCreateTweetPayload|resolveMediaUrl|deleteTweet" "$RUNNER" >/dev/null
rg -n -- "--input_file|--output_file|--post_text|--cdp_port|--profile_dir" "$RUNNER" >/dev/null

echo "Regression checks passed"
