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

test_docs_semantic_focus_message() {
  local repo subject body
  repo="$(make_repo)"
  (
    cd "$repo"
    cat > README.md <<'DOC'
## Install
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-git-auto-commit-rewrite
DOC
    cat > DEVELOPMENT.md <<'DOC'
This document is the source of truth for engineering standards.
DOC
    cat > AGENTS.md <<'DOC'
This file defines the assistant execution contract.
DOC
    bash "$AUTO_SCRIPT" >/dev/null
  )
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  body="$(git -C "$repo" log -1 --pretty=%B)"
  assert_eq "docs_semantic_focus_subject" "$subject" "docs: align installation command and clarify docs ownership"
  [[ "$body" == *"- Align installation command with the published skill name"* ]] || fail "docs_semantic_focus_body_install"
  [[ "$body" == *"- Clarify ownership boundaries between AGENTS.md and DEVELOPMENT.md"* ]] || fail "docs_semantic_focus_body_ownership"
  pass "docs_semantic_focus_message"
  rm -rf "$repo"
}

test_docs_bilingual_readme_message() {
  local repo subject body
  repo="$(make_repo)"
  (
    cd "$repo"
    cat > README.md <<'DOC'
# labali-skills
[中文说明](README.zh-CN.md)
DOC
    cat > README.zh-CN.md <<'DOC'
# labali-skills
[English](README.md)
DOC
    bash "$AUTO_SCRIPT" >/dev/null
  )
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  body="$(git -C "$repo" log -1 --pretty=%B)"
  assert_eq "docs_bilingual_readme_subject" "$subject" "docs: add Chinese README support and add bilingual readme cross-links"
  [[ "$body" == *"- Add Chinese README support for localized onboarding"* ]] || fail "docs_bilingual_readme_body_cn"
  [[ "$body" == *"- Add bidirectional links between English and Chinese README files"* ]] || fail "docs_bilingual_readme_body_links"
  pass "docs_bilingual_readme_message"
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
  assert_eq "infer_test_type" "$subject" "test: update tests"
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
  assert_eq "refactor_structured_subject" "$subject" "refactor: restructure ai tools documentation and add utility scripts"
  [[ "$body" == *"- Move AI Tools documentation files to docs directory"* ]] || fail "refactor_structured_body_move"
  [[ "$body" == *"- Add new utility scripts for file operations"* ]] || fail "refactor_structured_body_script"
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

test_mixed_script_and_test_message() {
  local repo subject body
  repo="$(make_repo)"
  (
    cd "$repo"
    mkdir -p scripts tests
    echo "echo v1" > scripts/auto_commit_rewrite.sh
    echo "ok" > tests/regression.test.js
    bash "$AUTO_SCRIPT" >/dev/null
  )
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  body="$(git -C "$repo" log -1 --pretty=%B)"
  assert_eq "mixed_script_and_test_subject" "$subject" "refactor: add utility scripts"
  [[ "$body" == *"- Add new utility scripts for auto commit rewrite"* ]] || fail "mixed_script_and_test_body_script"
  [[ "$body" != *"- Update regression tests"* ]] || fail "mixed_script_and_test_body_test"
  pass "mixed_script_and_test_message"
  rm -rf "$repo"
}

test_modified_script_and_test_message() {
  local repo subject body
  repo="$(make_repo)"
  (
    cd "$repo"
    mkdir -p scripts tests
    echo "echo v1" > scripts/auto_commit_rewrite.sh
    echo "ok1" > tests/regression.test.js
    git add -A
    git commit -q -m "chore: seed"

    echo "echo v2" > scripts/auto_commit_rewrite.sh
    echo "ok2" > tests/regression.test.js
    bash "$AUTO_SCRIPT" >/dev/null
  )
  subject="$(git -C "$repo" log -1 --pretty=%s)"
  body="$(git -C "$repo" log -1 --pretty=%B)"
  assert_eq "modified_script_and_test_subject" "$subject" "refactor: update auto commit rewrite scripts"
  [[ "$body" == *"- Update utility scripts for auto commit rewrite"* ]] || fail "modified_script_and_test_body_script"
  [[ "$body" != *"- Update regression tests"* ]] || fail "modified_script_and_test_body_test"
  pass "modified_script_and_test_message"
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
  test_docs_semantic_focus_message
  test_docs_bilingual_readme_message
  test_infer_test_type
  test_refactor_structured_message
  test_custom_message_normalization
  test_mixed_script_and_test_message
  test_modified_script_and_test_message
  test_clean_script_removes_coauthor
  echo "PASS all (${pass_count})"
}

main
