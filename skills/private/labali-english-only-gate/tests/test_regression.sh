#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_MD="$ROOT_DIR/SKILL.md"
OPENAI_YAML="$ROOT_DIR/agents/openai.yaml"
POLICY_MD="$ROOT_DIR/references/policy.md"
DEFAULT_CONFIG="$ROOT_DIR/references/default-policy.json"
DETECTOR="$ROOT_DIR/scripts/detect_language_policy.py"
CASES_JSON="$ROOT_DIR/tests/cases.json"

printf "Running regression checks for %s\n" "$ROOT_DIR"

[[ -f "$SKILL_MD" ]] || { echo "Missing SKILL.md"; exit 1; }
[[ -f "$OPENAI_YAML" ]] || { echo "Missing agents/openai.yaml"; exit 1; }
[[ -f "$POLICY_MD" ]] || { echo "Missing references/policy.md"; exit 1; }
[[ -f "$ROOT_DIR/references/wrapper-design.md" ]] || { echo "Missing references/wrapper-design.md"; exit 1; }
[[ -f "$DEFAULT_CONFIG" ]] || { echo "Missing references/default-policy.json"; exit 1; }
[[ -f "$DETECTOR" ]] || { echo "Missing scripts/detect_language_policy.py"; exit 1; }
[[ -f "$CASES_JSON" ]] || { echo "Missing tests/cases.json"; exit 1; }

rg -n "english-dominant|strict-english|rejection message|allow small Chinese fragments|first meaningful narrative clause|wrapper|router" "$SKILL_MD" "$POLICY_MD" "$ROOT_DIR/references/wrapper-design.md" >/dev/null
rg -n "display_name|default_prompt|English Only Gate" "$OPENAI_YAML" >/dev/null
python3 "$DETECTOR" --text "Please refactor this function." >/dev/null

python3 - <<'PY' "$DETECTOR" "$CASES_JSON"
import json
import subprocess
import sys
import tempfile
from pathlib import Path

detector = Path(sys.argv[1])
cases = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))

for case in cases:
    cmd = [sys.executable, str(detector), "--text", case["text"], "--json"]
    tmp_path = None
    if "config" in case:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(case["config"], handle, ensure_ascii=False)
            tmp_path = handle.name
        cmd.extend(["--config", tmp_path])

    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        payload = json.loads(result.stdout)
        actual = payload["status"]
        expected = case["expected_status"]
        if actual != expected:
            raise SystemExit(
                f"Case {case['name']} failed: expected {expected}, got {actual}. Payload={payload}"
            )
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)

print("Detector regression cases passed")
PY

echo "Regression checks passed"
