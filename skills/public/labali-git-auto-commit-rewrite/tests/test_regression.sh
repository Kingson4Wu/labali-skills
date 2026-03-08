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
  git -C "$tmp" init -q
  git -C "$tmp" config user.name "Skill Test"
  git -C "$tmp" config user.email "skill-test@example.com"
  echo "$tmp"
}

test_no_changes() {
  local repo out
  repo="$(make_repo)"
  out="$(
    cd "$repo"
    bash "$AUTO_SCRIPT"
  )"
  assert_eq "no_changes" "$out" "No changes to commit."
  pass "no_changes"
  rm -rf "$repo"
}

test_infer_docs_type() {
  local repo subject out
  repo="$(make_repo)"
  out="$(
    cd "$repo"
    echo "doc" > README.md
    bash "$AUTO_SCRIPT"
  )"
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  assert_eq "infer_docs_type" "$subject" "docs: update documentation"
  [[ "$out" == *"Committed:"* ]] || fail "infer_docs_type_output"
  pass "infer_docs_type"
  rm -rf "$repo"
}

test_infer_test_type() {
  local repo subject
  repo="$(make_repo)"
  (
    cd "$repo"
    mkdir -p tests
    echo "ok" > tests/unit.test.js
    bash "$AUTO_SCRIPT" >/dev/null
  )
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  assert_eq "infer_test_type" "$subject" "test: update 1 file(s)"
  pass "infer_test_type"
  rm -rf "$repo"
}

test_refactor_structured_message() {
  local repo subject body
  repo="$(make_repo)"
  (
    cd "$repo"
    mkdir -p docs scripts
    echo "old" > AI_TOOLS.md
    echo "note" > docs/git-encryption.md
    git add -A
    git commit -q -m "chore: seed"

    git mv AI_TOOLS.md docs/AI_TOOLS.md
    echo "echo util" > scripts/file_ops.sh
    echo "updated" > docs/git-encryption.md
    bash "$AUTO_SCRIPT" >/dev/null
  )
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  body="$(git -C "$repo" log -1 --pretty=%B)"
  assert_eq "refactor_structured_subject" "$subject" "refactor: restructure documentation and add utility scripts"
  [[ "$body" == *"- Move and reorganize 1 file(s)"* ]] || fail "refactor_structured_body_move"
  [[ "$body" == *"- Add 1 new utility script file(s)"* ]] || fail "refactor_structured_body_script"
  [[ "$body" == *"- Update git encryption documentation"* ]] || fail "refactor_structured_body_docs"
  pass "refactor_structured_message"
  rm -rf "$repo"
}

test_custom_message_normalization() {
  local repo subject
  repo="$(make_repo)"
  (
    cd "$repo"
    echo "x" > src.txt
    COMMIT_MSG="feat(api): Add endpoint" bash "$AUTO_SCRIPT" >/dev/null
  )
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  assert_eq "custom_message_normalization" "$subject" "feat(api): add endpoint"
  pass "custom_message_normalization"
  rm -rf "$repo"
}

test_clean_script_removes_coauthor() {
  local repo body
  repo="$(make_repo)"
  (
    cd "$repo"
    echo "x" > a.txt
    git add -A
    git commit -q -m $'chore(repo): keep message\n\nline1\n\n\nCo-authored-by: Demo <demo@example.com>'
    bash "$CLEAN_SCRIPT" >/dev/null
  )
  body="$(git -C "$repo" log -1 --pretty=%B)"
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
  test_refactor_structured_message
  test_custom_message_normalization
  test_clean_script_removes_coauthor
  echo "PASS all (${pass_count})"
}

main
