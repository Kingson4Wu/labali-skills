#!/usr/bin/env python3
"""Check that no Chinese characters appear in doc/config files except README.zh-CN.md.

Scope: markdown, yaml, and yml files only.
Code files (*.ts, *.py, *.sh, *.js) are excluded because browser automation
scripts may legitimately contain Chinese UI strings for platform text matching.
Test data files (*.json, *.txt) are also excluded.

Exit code: 0 if clean, 1 if violations found.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Directories to skip entirely
SKIP_DIRS = {
    ".git",
    ".cache",
    "node_modules",
    "__pycache__",
    ".venv",
    "dist",
    "coverage",
}

# Only check these file extensions
CHECK_EXTENSIONS = {".md", ".yaml", ".yml"}

# File names that are allowed to contain Chinese
ALLOWED_FILENAMES = {"README.zh-CN.md"}

# Specific files (relative to repo root) that are allowed to contain Chinese
ALLOWED_REL_PATHS = {
    "README.md",  # top-level README uses [中文] as link label to the zh-CN version
}

# CJK Unicode ranges covering Chinese characters
# Note: must use regular strings (not raw strings) so \u escapes are processed
CJK_RE = re.compile(
    "[\u4e00-\u9fff"       # CJK Unified Ideographs (most common Chinese)
    "\u3400-\u4dbf"        # CJK Extension A
    "\u3000-\u303f"        # CJK Symbols and Punctuation
    "\uff01-\uffef"        # Fullwidth forms
    "]"
)


def check_file(path: Path) -> list[tuple[int, str]]:
    """Return list of (line_number, line_content) for lines with Chinese chars."""
    hits: list[tuple[int, str]] = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return hits
    for lineno, line in enumerate(text.splitlines(), start=1):
        if CJK_RE.search(line):
            hits.append((lineno, line.rstrip()))
    return hits


def iter_files() -> list[Path]:
    files: list[Path] = []
    for p in REPO_ROOT.rglob("*"):
        if not p.is_file():
            continue
        # Skip disallowed directories
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        # Only check doc/config extensions
        if p.suffix.lower() not in CHECK_EXTENSIONS:
            continue
        # Skip allowed filenames
        if p.name in ALLOWED_FILENAMES:
            continue
        # Skip allowed specific paths
        if str(p.relative_to(REPO_ROOT)) in ALLOWED_REL_PATHS:
            continue
        files.append(p)
    return sorted(files)


def main() -> int:
    files = iter_files()
    violations: list[tuple[Path, list[tuple[int, str]]]] = []

    for f in files:
        hits = check_file(f)
        if hits:
            violations.append((f, hits))

    if not violations:
        total = len(files)
        print(f"OK: no Chinese characters found in {total} doc/config file(s) (*.md, *.yaml, *.yml)")
        return 0

    for path, hits in violations:
        rel = path.relative_to(REPO_ROOT)
        print(f"FAIL {rel}")
        for lineno, line in hits:
            preview = line[:120] + ("..." if len(line) > 120 else "")
            print(f"  line {lineno}: {preview}")

    print(f"\nFound Chinese characters in {len(violations)} file(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
