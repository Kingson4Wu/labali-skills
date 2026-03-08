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

is_doc_path() {
  local path="$1"
  [[ "$path" =~ (^|/)(docs?|references?|standards?)/ ]] || [[ "$path" =~ \.md$ ]] || [[ "$path" =~ (^|/)(README|CHANGELOG)(\..+)?$ ]]
}

is_test_path() {
  local path="$1"
  [[ "$path" =~ (^|/)(test|tests|__tests__)/ ]] || [[ "$path" =~ (\.|_)test\. ]]
}

is_script_path() {
  local path="$1"
  [[ "$path" =~ (^|/)(scripts?|tools?|bin)/ ]] || [[ "$path" =~ \.(sh|bash|zsh|py|js|ts|mjs|cjs)$ ]]
}

humanize() {
  local raw="$1"
  raw="${raw//_/ }"
  raw="${raw//-/ }"
  echo "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's/[[:space:]]+/ /g; s/^ +//; s/ +$//'
}

extract_doc_topic() {
  local path base
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    base="$(basename "$path")"
    base="${base%.*}"
    base="$(humanize "$base")"
    case "$base" in
      readme|changelog|index|skill) continue ;;
    esac
    if [[ -n "$base" ]]; then
      echo "$base"
      return
    fi
  done
}

join_phrases() {
  local joined=""
  local phrase
  for phrase in "$@"; do
    [[ -z "$phrase" ]] && continue
    if [[ -z "$joined" ]]; then
      joined="$phrase"
    else
      joined="${joined} and ${phrase}"
    fi
  done
  echo "$joined"
}

generate_message() {
  local name_status line status path old_path
  local rename_count=0 add_script_count=0 docs_count=0 other_count=0
  local -a doc_paths=() content_doc_paths=() phrases=() bullets=()

  name_status="$(git diff --cached --name-status -M)"
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    status="${line%%$'\t'*}"
    case "$status" in
      R*)
        old_path="${line#*$'\t'}"
        old_path="${old_path%%$'\t'*}"
        path="${line##*$'\t'}"
        rename_count=$((rename_count + 1))
        ;;
      *)
        path="${line#*$'\t'}"
        ;;
    esac

    if is_doc_path "$path"; then
      docs_count=$((docs_count + 1))
      doc_paths+=("$path")
      if [[ ! "$status" =~ ^R ]]; then
        content_doc_paths+=("$path")
      fi
    elif is_test_path "$path"; then
      other_count=$((other_count + 1))
    elif is_script_path "$path" && [[ "$status" == A* ]]; then
      add_script_count=$((add_script_count + 1))
    else
      other_count=$((other_count + 1))
    fi
  done <<<"$name_status"

  local topic subject type body=""
  topic=""
  if ((${#content_doc_paths[@]} > 0)); then
    topic="$(printf '%s\n' "${content_doc_paths[@]}" | extract_doc_topic || true)"
  elif ((${#doc_paths[@]} > 0)); then
    topic="$(printf '%s\n' "${doc_paths[@]}" | extract_doc_topic || true)"
  fi

  if ((rename_count > 0)); then
    if ((docs_count > 0)); then
      phrases+=("restructure documentation")
    else
      phrases+=("restructure project files")
    fi
  fi
  if ((add_script_count > 0)); then
    phrases+=("add utility scripts")
  fi
  if ((docs_count > 0)) && ((rename_count == 0)); then
    if [[ -n "$topic" ]]; then
      phrases+=("update ${topic} documentation")
    else
      phrases+=("update documentation")
    fi
  fi

  subject="$(join_phrases "${phrases[@]-}")"
  if [[ -z "$subject" ]]; then
    local files_changed
    files_changed="$(git diff --cached --name-only | wc -l | tr -d ' ')"
    subject="update ${files_changed} file(s)"
  fi

  if ((rename_count > 0)); then
    type="refactor"
  elif ((docs_count > 0)) && ((other_count == 0)) && ((add_script_count == 0)); then
    type="docs"
  elif printf '%s\n' "$name_status" | cut -f2- | grep -Eiq '(^|/)(test|tests|__tests__)/|(\.|_)test\.'; then
    type="test"
  else
    type="$(infer_type)"
    if [[ "$type" == "chore" ]] && ((add_script_count > 0)); then
      type="refactor"
    fi
  fi

  if ((rename_count > 0)); then
    bullets+=("- Move and reorganize ${rename_count} file(s)")
  fi
  if ((add_script_count > 0)); then
    bullets+=("- Add ${add_script_count} new utility script file(s)")
  fi
  if ((docs_count > 0)); then
    if [[ -n "$topic" ]]; then
      bullets+=("- Update ${topic} documentation")
    else
      bullets+=("- Update documentation files")
    fi
  fi
  if ((other_count > 0)); then
    bullets+=("- Adjust ${other_count} additional file(s)")
  fi

  if ((${#bullets[@]} > 0)); then
    body="$(printf '%s\n' "${bullets[@]}")"
    echo "${type}: ${subject}"$'\n\n'"${body}"
  else
    echo "${type}: ${subject}"
  fi
}

normalize_message() {
  local raw="$1"
  local subject body msg
  subject="$(printf '%s\n' "$raw" | sed -n '1p' | sed -E 's/[[:space:]]+/ /g; s/^ +//; s/ +$//')"
  body="$(printf '%s\n' "$raw" | sed '1d' | sed '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba')"

  # Enforce a simple conventional style fallback when caller does not provide one.
  if [[ ! "$subject" =~ ^[a-z]+(\([a-z0-9._/-]+\))?:\  ]]; then
    subject="chore: ${subject}"
  fi

  # Normalize first character after ": " to lowercase for consistency.
  local prefix="${subject%%: *}"
  local normalized_subject="${subject#*: }"
  normalized_subject="$(tr '[:upper:]' '[:lower:]' <<<"${normalized_subject:0:1}")${normalized_subject:1}"
  msg="${prefix}: ${normalized_subject}"

  # Keep subject line concise for commit history readability.
  if ((${#msg} > 72)); then
    msg="${msg:0:69}..."
  fi

  if [[ -n "$body" ]]; then
    msg="${msg}"$'\n\n'"${body}"
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
  msg="$(generate_message)"
fi

msg="$(normalize_message "$msg")"
git commit -m "$msg"
bash "$CLEAN_SCRIPT"

final_hash=$(git rev-parse --short HEAD)
final_subject=$(git log -1 --pretty=%s)

echo "Committed: ${final_hash} ${final_subject}"
