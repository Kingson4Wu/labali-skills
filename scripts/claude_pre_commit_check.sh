#!/bin/bash
# Claude Code PreToolUse hook — blocks git commit if validation fails.
# Receives Bash tool input as JSON via stdin.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))")

# Only intercept git commit commands
if ! echo "$COMMAND" | grep -qE "git (commit|push)"; then
  exit 0
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
