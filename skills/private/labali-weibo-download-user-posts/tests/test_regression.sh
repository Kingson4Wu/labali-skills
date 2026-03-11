#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
RUNNER="$SCRIPTS_DIR/run.ts"
EXECUTOR="$SCRIPTS_DIR/executor.ts"
CORE="$SCRIPTS_DIR/core.ts"
ARCH="$ROOT_DIR/references/architecture.md"
PLAN="$ROOT_DIR/references/plan.md"
SKILL_MD="$ROOT_DIR/SKILL.md"
SKILL_YAML="$ROOT_DIR/skill.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$EXECUTOR" ]] || { echo "Missing executor.ts"; exit 1; }
[[ -f "$CORE" ]] || { echo "Missing core.ts"; exit 1; }
[[ -f "$ARCH" ]] || { echo "Missing references/architecture.md"; exit 1; }
[[ -f "$PLAN" ]] || { echo "Missing references/plan.md"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }

rg -n "Layer Contract|Success Criteria|Operational Mode" "$SKILL_MD" >/dev/null
rg -n "Layered Boundaries|Execution Model|Download Correctness Standards" "$ARCH" >/dev/null
rg -n "manual login|remote-debugging-port=9222|chrome-labali|posts.json|user.md|post.md|scroll|CDP" "$PLAN" "$SKILL_MD" "$EXECUTOR" "$CORE" >/dev/null

rg -n -- "--user_url|--output_dir|--profile_dir|--cdp_port|--timeout_ms|--overwrite|--max_posts|--include_videos" "$RUNNER" >/dev/null
rg -n "请输入微博用户主页链接|请输入本地保存目录" "$EXECUTOR" >/dev/null
rg -n "connectOverCDP|ensureChromeWithRemoteDebugging|waitForManualLogin|extractUserPosts|downloadMedia|writePostsJson|writeUserMarkdown|canonicalizeUserUrl|weibo.com" "$EXECUTOR" "$CORE" >/dev/null

echo "Regression checks passed"
