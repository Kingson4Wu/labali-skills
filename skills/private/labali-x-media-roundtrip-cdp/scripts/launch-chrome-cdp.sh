#!/usr/bin/env bash
set -euo pipefail

CDP_PORT="${1:-9222}"
PROFILE_DIR="${2:-$HOME/.chrome-private}"

open -na "Google Chrome" --args --remote-debugging-port="$CDP_PORT" --user-data-dir="$PROFILE_DIR"
echo "Chrome launched with CDP: port=$CDP_PORT profile=$PROFILE_DIR"
