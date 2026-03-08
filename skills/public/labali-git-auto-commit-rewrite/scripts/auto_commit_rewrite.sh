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

to_title_case() {
  local input="$1"
  [[ -z "$input" ]] && return
  printf '%s\n' "$input" | awk '{
    for (i = 1; i <= NF; i++) {
      lower = tolower($i)
      if (lower == "ai") {
        $i = "AI"
      } else if (lower == "api") {
        $i = "API"
      } else {
        $i = toupper(substr($i,1,1)) tolower(substr($i,2))
      }
    }
    print
  }'
}

extract_doc_topic() {
  local path base
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    base="$(basename "$path")"
    base="${base%.*}"
    base="$(humanize "$base")"
    case "$base" in
      readme|changelog|index|skill|contributing|security|license|"code of conduct") continue ;;
    esac
    if [[ -n "$base" ]]; then
      echo "$base"
      return
    fi
  done
}

extract_target_dir() {
  local path dir
  path="$1"
  dir="$(dirname "$path")"
  dir="${dir##*/}"
  case "$dir" in
    .|'') echo "" ;;
    *) echo "$(humanize "$dir")" ;;
  esac
}

extract_script_purpose() {
  local path base purpose
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    base="$(basename "$path")"
    base="${base%.*}"
    base="$(humanize "$base")"

    # Remove noisy suffix words.
    purpose="$(echo "$base" | sed -E 's/(^| )(script|scripts|util|utils|tool|tools)$//g; s/[[:space:]]+/ /g; s/^ +//; s/ +$//')"

    # Keep purpose natural.
    purpose="$(echo "$purpose" | sed -E 's/ ops$/ operations/; s/ mgmt$/ management/')"

    case "$purpose" in
      ''|main|index|run) continue ;;
    esac

    if [[ -n "$purpose" ]]; then
      echo "$purpose"
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
  local rename_count=0 add_script_count=0 script_touch_count=0 docs_count=0 other_count=0 test_count=0
  local -a doc_paths=() content_doc_paths=() renamed_doc_paths=() script_paths=() added_script_paths=() phrases=() bullets=()

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
        if is_doc_path "$path" || is_doc_path "$old_path"; then
          renamed_doc_paths+=("$path")
        fi
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
      test_count=$((test_count + 1))
      other_count=$((other_count + 1))
    elif is_script_path "$path"; then
      script_touch_count=$((script_touch_count + 1))
      script_paths+=("$path")
      if [[ "$status" == A* ]]; then
        add_script_count=$((add_script_count + 1))
        added_script_paths+=("$path")
      else
        other_count=$((other_count + 1))
      fi
    else
      other_count=$((other_count + 1))
    fi
  done <<<"$name_status"

  local topic move_topic move_target_dir script_purpose subject type body=""
  topic=""
  move_topic=""
  move_target_dir=""
  script_purpose=""

  if ((${#content_doc_paths[@]} > 0)); then
    topic="$(printf '%s\n' "${content_doc_paths[@]}" | extract_doc_topic || true)"
  elif ((${#doc_paths[@]} > 0)); then
    topic="$(printf '%s\n' "${doc_paths[@]}" | extract_doc_topic || true)"
  fi

  if ((${#renamed_doc_paths[@]} > 0)); then
    move_topic="$(printf '%s\n' "${renamed_doc_paths[@]}" | extract_doc_topic || true)"
    move_target_dir="$(extract_target_dir "${renamed_doc_paths[0]}")"
  fi

  if ((${#added_script_paths[@]} > 0)); then
    script_purpose="$(printf '%s\n' "${added_script_paths[@]}" | extract_script_purpose || true)"
  elif ((${#script_paths[@]} > 0)); then
    script_purpose="$(printf '%s\n' "${script_paths[@]}" | extract_script_purpose || true)"
  fi

  if ((rename_count > 0)); then
    if [[ -n "$move_topic" ]]; then
      phrases+=("restructure ${move_topic} documentation")
    elif ((docs_count > 0)); then
      phrases+=("restructure documentation")
    else
      phrases+=("restructure project files")
    fi
  fi
  if ((add_script_count > 0)); then
    phrases+=("add utility scripts")
  elif ((script_touch_count > 0)); then
    if [[ -n "$script_purpose" ]]; then
      phrases+=("update ${script_purpose} scripts")
    else
      phrases+=("update utility scripts")
    fi
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
    if ((test_count > 0)) && ((other_count == test_count)); then
      subject="update tests"
    else
      local files_changed
      files_changed="$(git diff --cached --name-only | wc -l | tr -d ' ')"
      subject="update ${files_changed} project files"
    fi
  fi

  if ((rename_count > 0)); then
    type="refactor"
  elif ((docs_count > 0)) && ((other_count == 0)) && ((add_script_count == 0)); then
    type="docs"
  elif ((test_count > 0)) && ((other_count == test_count)) && ((script_touch_count == 0)) && ((docs_count == 0)) && ((rename_count == 0)); then
    type="test"
  else
    type="$(infer_type)"
    if ((add_script_count > 0 || script_touch_count > 0)); then
      type="refactor"
    fi
  fi

  if ((rename_count > 0)); then
    if [[ -n "$move_target_dir" && -n "$move_topic" ]]; then
      bullets+=("- Move $(to_title_case "$move_topic") documentation files to ${move_target_dir} directory")
    elif ((docs_count > 0)); then
      bullets+=("- Move documentation files to organized directories")
    else
      bullets+=("- Move files to improve project structure")
    fi
  fi
  if ((add_script_count > 0)); then
    if [[ -n "$script_purpose" ]]; then
      bullets+=("- Add new utility scripts for ${script_purpose}")
    else
      bullets+=("- Add new utility scripts")
    fi
  elif ((script_touch_count > 0)); then
    if [[ -n "$script_purpose" ]]; then
      bullets+=("- Update utility scripts for ${script_purpose}")
    else
      bullets+=("- Update utility scripts")
    fi
  fi
  if ((docs_count > 0)); then
    if [[ -n "$topic" ]]; then
      bullets+=("- Update ${topic} documentation")
    else
      bullets+=("- Update documentation content")
    fi
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
