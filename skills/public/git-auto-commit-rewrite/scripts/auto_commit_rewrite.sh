#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository."
  exit 1
fi

infer_type() {
  local files
  files="$(git diff --cached --name-only)"
  if [[ -z "$files" ]]; then
    echo "chore"
    return
  fi
  if echo "$files" | grep -Eiq '(^|/)(readme|changelog|docs?)/|\.md$'; then
    echo "docs"
    return
  fi
  if echo "$files" | grep -Eiq '(^|/)(test|tests|__tests__)/|(\.|_)test\.'; then
    echo "test"
    return
  fi
  echo "chore"
}

normalize_subject() {
  local raw="$1"
  local msg
  msg="$(echo "$raw" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ +//; s/ +$//')"

  # Enforce a simple conventional style fallback when caller does not provide one.
  if [[ ! "$msg" =~ ^[a-z]+(\([a-z0-9._/-]+\))?:\  ]]; then
    msg="chore(repo): ${msg}"
  fi

  # Normalize first character after ": " to lowercase for consistency.
  local prefix="${msg%%: *}"
  local subject="${msg#*: }"
  subject="$(tr '[:upper:]' '[:lower:]' <<<"${subject:0:1}")${subject:1}"
  msg="${prefix}: ${subject}"

  # Keep subject line concise for commit history readability.
  if ((${#msg} > 72)); then
    msg="${msg:0:69}..."
  fi
  echo "$msg"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEAN_SCRIPT="${SCRIPT_DIR}/clean_commit.sh"

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

# Generate a simple conventional commit subject from staged changes.
# Caller can pass COMMIT_MSG to override auto generation.
if [[ -n "${COMMIT_MSG:-}" ]]; then
  msg="$COMMIT_MSG"
else
  files_changed=$(git diff --cached --name-only | wc -l | tr -d ' ')
  commit_type="$(infer_type)"
  msg="${commit_type}(repo): update ${files_changed} file(s)"
fi

msg="$(normalize_subject "$msg")"
git commit -m "$msg"
bash "$CLEAN_SCRIPT"

final_hash=$(git rev-parse --short HEAD)
final_subject=$(git log -1 --pretty=%s)

echo "Committed: ${final_hash} ${final_subject}"
