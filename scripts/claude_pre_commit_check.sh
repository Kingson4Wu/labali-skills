#!/bin/bash
# Claude Code PreToolUse hook — blocks git commit if validation fails.
# Receives Bash tool input as JSON via stdin.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))")

# Only intercept git commit commands
if ! echo "$COMMAND" | grep -qE "git (commit|push)"; then
  exit 0
fi

# Enforce that commits go through the labali-git-auto-commit-rewrite skill.
# The skill sets LABALI_SKILL_COMMIT=1 in the commit command as an authorization signal.
if ! echo "$COMMAND" | grep -q "LABALI_SKILL_COMMIT=1"; then
  echo "✗ Direct git commit is not allowed." >&2
  echo "  Use the labali-git-auto-commit-rewrite skill to commit:" >&2
  echo "    - Installed: invoke via the Skill tool" >&2
  echo "    - Fallback:  read skills/public/labali-git-auto-commit-rewrite/SKILL.md and follow it" >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

echo "▶ Running validate_all.py..."
if ! python3 scripts/validate_all.py; then
  echo "✗ validate_all.py failed — commit blocked." >&2
  exit 1
fi

echo "▶ Running check_chinese.py..."
if ! python3 scripts/check_chinese.py; then
  echo "✗ check_chinese.py failed — commit blocked." >&2
  exit 1
fi

echo "✓ All checks passed."
exit 0
