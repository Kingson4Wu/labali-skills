#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$")
ALLOWED_FRONTMATTER_KEYS = {"name", "description"}


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("SKILL.md must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("Unclosed frontmatter in SKILL.md")

    raw = text[4:end].strip().splitlines()
    data: dict[str, str] = {}
    for line in raw:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        clean_key = key.strip()
        if clean_key in data:
            raise ValueError(f"Duplicate frontmatter field: {clean_key}")
        data[clean_key] = value.strip()
    return data


def validate_skill_dir(skill_dir: Path) -> list[str]:
    errors: list[str] = []

    if not skill_dir.exists() or not skill_dir.is_dir():
        return [f"Not a directory: {skill_dir}"]

    if not NAME_RE.match(skill_dir.name):
        errors.append(f"Invalid folder name: {skill_dir.name}")

    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        errors.append("Missing SKILL.md")
        return errors

    text = skill_md.read_text(encoding="utf-8")
    try:
        fm = parse_frontmatter(text)
    except ValueError as exc:
        errors.append(str(exc))
        return errors

    for key in ("name", "description"):
        if key not in fm or not fm[key]:
            errors.append(f"Frontmatter missing required field: {key}")

    unknown = sorted(set(fm.keys()) - ALLOWED_FRONTMATTER_KEYS)
    if unknown:
        errors.append(
            "Frontmatter contains unsupported fields: "
            + ", ".join(unknown)
            + " (only name, description are allowed)"
        )

    if fm.get("name") and fm["name"] != skill_dir.name:
        errors.append("Frontmatter name must match folder name")

    if (skill_dir / "agents" / "openai.yaml").exists() is False:
        errors.append("Missing recommended file: agents/openai.yaml")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate one skill folder")
    parser.add_argument("path", help="path to skill directory")
    args = parser.parse_args()

    skill_dir = Path(args.path)
    errors = validate_skill_dir(skill_dir)

    if errors:
        print(f"Validation failed: {skill_dir}")
        for err in errors:
            print(f"- {err}")
        return 1

    print(f"Validation passed: {skill_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
