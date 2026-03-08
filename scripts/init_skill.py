#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$")


def ensure_name(name: str) -> None:
    if not NAME_RE.match(name):
        raise ValueError(
            "Invalid skill name. Use lowercase letters, digits, hyphens (<=64 chars)."
        )


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize a new skill folder")
    parser.add_argument("name", help="skill name, e.g. prompt-optimizer")
    parser.add_argument("--path", default="skills/public", help="base directory for skill")
    parser.add_argument(
        "--resources",
        default="",
        help="comma separated optional dirs: scripts,references,assets",
    )
    args = parser.parse_args()

    skill_name = args.name.strip()
    ensure_name(skill_name)

    base = Path(args.path)
    skill_dir = base / skill_name
    if skill_dir.exists():
        raise FileExistsError(f"Skill already exists: {skill_dir}")

    resources = {r.strip() for r in args.resources.split(",") if r.strip()}
    allowed = {"scripts", "references", "assets"}
    invalid = resources - allowed
    if invalid:
        raise ValueError(f"Unsupported resources: {', '.join(sorted(invalid))}")

    skill_dir.mkdir(parents=True, exist_ok=False)

    skill_md = f"""---
name: {skill_name}
description: TODO describe what this skill does and when to use it
---

# {skill_name}

## Workflow

1. Understand the request context.
2. Load only required references/resources.
3. Execute steps deterministically.
4. Validate outputs before finishing.
"""
    write_file(skill_dir / "SKILL.md", skill_md)

    openai_yaml = f"""version: 1
interface:
  display_name: {skill_name}
  description: TODO short description
  default_prompt: TODO default prompt
"""
    write_file(skill_dir / "agents" / "openai.yaml", openai_yaml)

    for folder in sorted(resources):
        target = skill_dir / folder
        target.mkdir(parents=True, exist_ok=True)
        write_file(target / ".gitkeep", "")

    print(f"Created skill: {skill_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
