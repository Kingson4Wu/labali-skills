#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from quick_validate import validate_skill_dir

ROOTS = (REPO_ROOT / "skills/public", REPO_ROOT / "skills/private")


def iter_skill_dirs() -> list[Path]:
    dirs: list[Path] = []
    for root in ROOTS:
        if not root.exists():
            continue
        for p in sorted(root.iterdir()):
            if p.is_dir():
                dirs.append(p)
    return dirs


def main() -> int:
    failures = 0
    skills = iter_skill_dirs()

    if not skills:
        print("No skills found under skills/public or skills/private")
        return 0

    for skill in skills:
        errors = validate_skill_dir(skill)
        display = skill.relative_to(REPO_ROOT)
        if errors:
            failures += 1
            print(f"FAIL {display}")
            for err in errors:
                print(f"  - {err}")
        else:
            print(f"PASS {display}")

    if failures:
        print(f"\nValidation finished with {failures} failure(s)")
        return 1

    print("\nAll skills passed validation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
