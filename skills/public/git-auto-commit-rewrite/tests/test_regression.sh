#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUTO_SCRIPT="${SKILL_DIR}/scripts/auto_commit_rewrite.sh"
CLEAN_SCRIPT="${SKILL_DIR}/scripts/clean_commit.sh"

pass_count=0

pass() {
  pass_count=$((pass_count + 1))
  echo "PASS $1"
}

fail() {
  echo "FAIL $1"
  exit 1
}

assert_eq() {
  local name="$1"
  local got="$2"
  local want="$3"
  if [[ "$got" != "$want" ]]; then
    echo "Expected: $want"
    echo "Got:      $got"
    fail "$name"
  fi
}

make_repo() {
  local tmp
  tmp="$(mktemp -d)"
  cd "$tmp"
  git init -q
  git config user.name "Skill Test"
  git config user.email "skill-test@example.com"
  echo "$tmp"
}

test_no_changes() {
  local repo out
  repo="$(make_repo)"
  out="$(bash "$AUTO_SCRIPT")"
  assert_eq "no_changes" "$out" "No changes to commit."
  pass "no_changes"
  rm -rf "$repo"
}

test_infer_docs_type() {
  local repo subject
  repo="$(make_repo)"
  echo "doc" > README.md
  out="$(bash "$AUTO_SCRIPT")"
  subject="$(git log -1 --pretty=%s)"
  assert_eq "infer_docs_type" "$subject" "docs(repo): update 1 file(s)"
  [[ "$out" == Committed:* ]] || fail "infer_docs_type_output"
  pass "infer_docs_type"
  rm -rf "$repo"
}

test_infer_test_type() {
  local repo subject
  repo="$(make_repo)"
  mkdir -p tests
  echo "ok" > tests/unit.test.js
  bash "$AUTO_SCRIPT" >/dev/null
  subject="$(git log -1 --pretty=%s)"
  assert_eq "infer_test_type" "$subject" "test(repo): update 1 file(s)"
  pass "infer_test_type"
  rm -rf "$repo"
}

test_custom_message_normalization() {
  local repo subject
  repo="$(make_repo)"
  echo "x" > src.txt
  COMMIT_MSG="feat(api): Add endpoint" bash "$AUTO_SCRIPT" >/dev/null
  subject="$(git log -1 --pretty=%s)"
  assert_eq "custom_message_normalization" "$subject" "feat(api): add endpoint"
  pass "custom_message_normalization"
  rm -rf "$repo"
}

test_clean_script_removes_coauthor() {
  local repo body
  repo="$(make_repo)"
  echo "x" > a.txt
  git add -A
  git commit -q -m $'chore(repo): keep message\n\nline1\n\n\nCo-authored-by: Demo <demo@example.com>'
  bash "$CLEAN_SCRIPT" >/dev/null
  body="$(git log -1 --pretty=%B)"
  if echo "$body" | grep -q "Co-authored-by"; then
    fail "clean_script_removes_coauthor"
  fi
  pass "clean_script_removes_coauthor"
  rm -rf "$repo"
}

main() {
  test_no_changes
  test_infer_docs_type
  test_infer_test_type
  test_custom_message_normalization
  test_clean_script_removes_coauthor
  echo "PASS all (${pass_count})"
}

main
