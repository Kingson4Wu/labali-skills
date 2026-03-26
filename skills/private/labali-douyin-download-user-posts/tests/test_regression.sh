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
OPENAI_YAML="$ROOT_DIR/agents/openai.yaml"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$RUNNER" ]] || { echo "Missing run.ts"; exit 1; }
[[ -f "$EXECUTOR" ]] || { echo "Missing executor.ts"; exit 1; }
[[ -f "$CORE" ]] || { echo "Missing core.ts"; exit 1; }
[[ -f "$ARCH" ]] || { echo "Missing references/architecture.md"; exit 1; }
[[ -f "$PLAN" ]] || { echo "Missing references/plan.md"; exit 1; }
[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$SKILL_YAML" ]] || { echo "Missing skill.yaml"; exit 1; }
[[ -f "$OPENAI_YAML" ]] || { echo "Missing agents/openai.yaml"; exit 1; }

rg -n "Layer Contract|Success Criteria|Operational Mode" "$SKILL_MD" >/dev/null
rg -n "Layered Boundaries|Execution Model|Download Correctness Standards" "$ARCH" >/dev/null
rg -n "agent-browser|CDP|manual login|remote-debugging-port=9223|chrome-labali-no-proxy|no-proxy-server|posts.json|user.md|post.md|scroll|Douyin|抖音" "$PLAN" "$SKILL_MD" "$EXECUTOR" "$CORE" >/dev/null

rg -n -- "--user_url|--output_dir|--fixed_user_dir|--profile_dir|--cdp_port|--timeout_ms|--overwrite|--max_posts|--include_videos|--collect_links_only" "$RUNNER" >/dev/null
rg -n "请输入抖音用户主页链接|请输入本地保存目录" "$EXECUTOR" >/dev/null
rg -n "connectOverCDP|ensureChromeWithRemoteDebugging|waitForManualLogin|ensureOnUserProfilePage|ensureOnWorksTab|extractUserPosts|downloadMedia|writePostsJson|writeUserMarkdown|canonicalizeUserUrl|douyin.com" "$EXECUTOR" "$CORE" >/dev/null

echo "Regression checks passed"
