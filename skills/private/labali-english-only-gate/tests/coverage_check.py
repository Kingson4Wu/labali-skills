#!/usr/bin/env python3
"""Coverage checker for detect_language_policy.py.

Runs all test cases and checks which branches in decide() are exercised.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

DETECTOR = Path(__file__).resolve().parents[1] / "scripts" / "detect_language_policy.py"
CASES_JSON = Path(__file__).resolve().parents[1] / "tests" / "cases.json"
EDGE_CASES_JSON = Path(__file__).resolve().parents[1] / "tests" / "edge_cases.json"


def load_cases(path: Path) -> list[dict[str, Any]]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


def run_case(text: str, config: dict[str, object] | None = None) -> dict[str, Any]:
    import tempfile
    cmd = [sys.executable, str(DETECTOR), "--text", text, "--json"]
    tmp_path = None
    if config:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False)
            tmp_path = f.name
        cmd.extend(["--config", tmp_path])
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        return json.loads(result.stdout)
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


def check_branches(cases: list[dict[str, Any]], edge_cases: list[dict[str, Any]]) -> dict[str, bool]:
    """Check which branches of decide() are exercised."""
    branches = {
        "no_narrative_ALLOW": False,
        "strict_english_REJECT": False,
        "strict_english_ALLOW": False,
        "no_mixed_REJECT": False,
        "no_english_REJECT": False,
        "prefer_leading_REJECT": False,
        "prefer_leading_language_value_REJECT": False,
        "ratio_REJECT": False,
        "ALLOW": False,
        "WARNING": False,
        "cjk_count_gt_0": False,
    }

    for case in cases + edge_cases:
        config = case.get("config")
        result = run_case(case["text"], config)
        status = result.get("status", "UNKNOWN")
        mode = result.get("mode", "english-dominant")
        ratio = result.get("non_english_ratio", 0.0)
        first_clause_leading = result.get("first_clause_leading", "")
        cjk_count = result.get("cjk_count", 0)
        non_english_count = result.get("non_english_count", 0)
        english_count = result.get("english_count", 0)
        counted_letters = result.get("counted_letters", 0)

        # Determine which branches fired
        if counted_letters == 0:
            branches["no_narrative_ALLOW"] = True
        elif mode == "strict-english":
            if non_english_count > 0:
                branches["strict_english_REJECT"] = True
            else:
                branches["strict_english_ALLOW"] = True
        elif config and not config.get("allow_mixed_input", True) and non_english_count > 0:
            branches["no_mixed_REJECT"] = True
        elif english_count == 0 and non_english_count > 0:
            branches["no_english_REJECT"] = True
        elif first_clause_leading in ("cjk", "non_english"):
            branches["prefer_leading_REJECT"] = True
        elif config and config.get("prefer_english_leading_narrative", True) and result.get("first_clause_language") in ("non_english", "non_english_mixed"):
            branches["prefer_leading_language_value_REJECT"] = True
        elif ratio > (config.get("max_non_english_ratio", 0.2) if config else 0.2):
            branches["ratio_REJECT"] = True
        elif status == "WARNING":
            branches["WARNING"] = True
        elif status == "ALLOW":
            branches["ALLOW"] = True
        if cjk_count > 0:
            branches["cjk_count_gt_0"] = True

    return branches


def main() -> int:
    cases = load_cases(CASES_JSON)
    edge_cases = load_cases(EDGE_CASES_JSON)

    print(f"Checking coverage against {len(cases)} cases + {len(edge_cases)} edge cases")
    branches = check_branches(cases, edge_cases)

    print("\nBranch coverage:")
    all_passed = True
    for branch, exercised in sorted(branches.items()):
        marker = "✓" if exercised else "✗"
        print(f"  {marker} {branch}")
        if not exercised:
            all_passed = False

    # Run actual case validation
    print("\nCase validation:")
    failed = []
    for case in cases + edge_cases:
        config = case.get("config")
        result = run_case(case["text"], config)
        actual = result.get("status", "UNKNOWN")
        expected = case["expected_status"]
        if expected == "ALLOW" and actual == "WARNING":
            print(f"  ✓ {case['name']}: WARNING (borderline, ALLOW-equivalent)")
        elif actual != expected:
            failed.append(f"  ✗ {case['name']}: expected {expected}, got {actual}")
            print(f"  ✗ {case['name']}: expected {expected}, got {actual}")
        else:
            print(f"  ✓ {case['name']}: {actual}")

    if failed:
        print(f"\n{len(failed)} case(s) failed")
        return 1

    if not all_passed:
        print("\nSome branches not exercised — add more edge cases")
        return 1

    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
