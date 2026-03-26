#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$")
ALLOWED_FRONTMATTER_KEYS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
}


class FrontmatterError(ValueError):
    pass


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _parse_scalar(value: str) -> object:
    text = value.strip()
    if text == "":
        return ""
    if text in {"null", "~"}:
        return None
    if text == "true":
        return True
    if text == "false":
        return False
    if re.fullmatch(r"-?\d+", text):
        try:
            return int(text)
        except ValueError:
            pass
    return _strip_quotes(text)


def _parse_block_scalar(
    lines: list[str], start: int, parent_indent: int, style: str
) -> tuple[str, int]:
    i = start
    chunks: list[str] = []
    min_content_indent: int | None = None

    while i < len(lines):
        line = lines[i]
        if line.strip() == "":
            chunks.append("")
            i += 1
            continue

        indent = len(line) - len(line.lstrip(" "))
        if indent <= parent_indent:
            break

        if min_content_indent is None:
            min_content_indent = indent

        content_indent = min(indent, min_content_indent)
        chunks.append(line[content_indent:])
        i += 1

    if min_content_indent is None:
        return "", i

    raw = "\n".join(chunks)
    keep_final_newline = style in {"|", ">"}
    if style.startswith("|"):
        return raw + ("\n" if keep_final_newline else ""), i

    paragraphs: list[str] = []
    current: list[str] = []
    for chunk in chunks:
        if chunk == "":
            if current:
                paragraphs.append(" ".join(part.strip() for part in current))
                current = []
            paragraphs.append("")
            continue
        current.append(chunk)

    if current:
        paragraphs.append(" ".join(part.strip() for part in current))

    folded = "\n".join(paragraphs)
    if keep_final_newline:
        folded += "\n"
    return folded, i


def _parse_mapping(
    lines: list[str], start: int = 0, base_indent: int = 0
) -> tuple[dict[str, object], int]:
    data: dict[str, object] = {}
    i = start

    while i < len(lines):
        line = lines[i]
        if line.strip() == "":
            i += 1
            continue

        indent = len(line) - len(line.lstrip(" "))
        if indent < base_indent:
            break
        if indent > base_indent:
            raise FrontmatterError(f"Unexpected indentation: {line!r}")

        stripped = line[base_indent:]
        if ":" not in stripped:
            raise FrontmatterError(f"Invalid frontmatter line: {line!r}")

        key, raw_value = stripped.split(":", 1)
        key = key.strip()
        if not key:
            raise FrontmatterError("Frontmatter keys must be strings")
        if key in data:
            raise FrontmatterError(f"Duplicate frontmatter field: {key}")

        value_text = raw_value.lstrip(" ")
        if value_text == "":
            nested, next_i = _parse_mapping(lines, i + 1, base_indent + 2)
            data[key] = nested
            i = next_i
            continue

        if value_text in {"|", "|-", ">", ">-"}:
            block_value, next_i = _parse_block_scalar(
                lines, i + 1, base_indent, value_text
            )
            data[key] = block_value
            i = next_i
            continue

        data[key] = _parse_scalar(value_text)
        i += 1

    return data, i


def parse_frontmatter(text: str) -> dict[str, object]:
    if not text.startswith("---\n"):
        raise ValueError("SKILL.md must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("Unclosed frontmatter in SKILL.md")

    raw = text[4:end].strip()
    try:
        data, _ = _parse_mapping(raw.splitlines())
    except FrontmatterError as exc:
        raise ValueError(f"Invalid YAML frontmatter: {exc}") from exc

    normalized: dict[str, object] = {}
    for key, value in data.items():
        if key in normalized:
            raise ValueError(f"Duplicate frontmatter field: {key}")
        normalized[key] = value
    return normalized


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
            + " (allowed: "
            + ", ".join(sorted(ALLOWED_FRONTMATTER_KEYS))
            + ")"
        )

    if fm.get("name") and fm["name"] != skill_dir.name:
        errors.append("Frontmatter name must match folder name")

    if (skill_dir / "agents" / "openai.yaml").exists() is False:
        errors.append("Missing recommended file: agents/openai.yaml")

    # Dependency isolation checks
    if (skill_dir / "requirements.txt").exists():
        if not (skill_dir / "pyproject.toml").exists():
            errors.append(
                "Python skill has requirements.txt but missing pyproject.toml"
                " (required for uv-based isolation)"
            )

    if (skill_dir / "package.json").exists():
        pkg_text = (skill_dir / "package.json").read_text(encoding="utf-8")
        try:
            import json
            pkg = json.loads(pkg_text)
        except Exception:
            pkg = {}
        if "engines" not in pkg or "node" not in pkg.get("engines", {}):
            errors.append(
                "TypeScript skill package.json missing engines.node field"
            )
        if not (skill_dir / "pnpm-lock.yaml").exists():
            errors.append(
                "TypeScript skill missing pnpm-lock.yaml"
                " (run: pnpm install --dir <skill_root> --lockfile-only)"
            )

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
