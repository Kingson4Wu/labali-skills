#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parent.parent / "references" / "default-policy.json"
)
OVERRIDE_CONFIG_PATH = Path(__file__).resolve().parent.parent / "policy.override.json"

CODE_BLOCK_RE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`]*`")
PATH_TOKEN_RE = re.compile(
    r"(?:(?:[A-Za-z]:)?[/~][^\s]+|(?:\.\.?/)[^\s]+|[^\s]+\.[A-Za-z0-9]{1,8})"
)
URL_RE = re.compile(r"https?://[^\s]+")
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
ENGLISH_RE = re.compile(r"[A-Za-z]")
CLAUSE_SPLIT_RE = re.compile(r"[\n\r.!?;:。！？；：]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Detect whether a prompt passes the English-only gate."
    )
    parser.add_argument("--text", help="Input text to evaluate")
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Read input text from stdin when --text is not provided",
    )
    parser.add_argument(
        "--config",
        help="Optional JSON config override path. Defaults to references/default-policy.json",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON instead of key=value lines",
    )
    return parser.parse_args()


def load_config(config_path: str | None) -> dict[str, object]:
    if config_path:
        path = Path(config_path)
    elif OVERRIDE_CONFIG_PATH.exists():
        path = OVERRIDE_CONFIG_PATH
    else:
        path = DEFAULT_CONFIG_PATH
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    required = {
        "mode",
        "max_non_english_ratio",
        "allow_mixed_input",
        "allow_cjk_in_code_or_paths",
        "prefer_english_leading_narrative",
        "ignore_short_cjk_fragments_under",
        "rejection_message",
    }
    missing = required - set(data)
    if missing:
        raise ValueError(f"Missing config keys: {', '.join(sorted(missing))}")
    return data


def read_text(args: argparse.Namespace) -> str:
    if args.text is not None:
        return args.text
    if args.stdin:
        return sys.stdin.read()
    raise ValueError("Provide --text or --stdin")


def strip_narrative_exemptions(text: str, allow_cjk_in_code_or_paths: bool) -> str:
    sanitized = CODE_BLOCK_RE.sub(" ", text)
    sanitized = INLINE_CODE_RE.sub(" ", sanitized)
    if allow_cjk_in_code_or_paths:
        sanitized = URL_RE.sub(" ", sanitized)
        sanitized = PATH_TOKEN_RE.sub(" ", sanitized)
    return sanitized


def count_non_english_letters(text: str) -> int:
    count = 0
    for char in text:
        if ENGLISH_RE.fullmatch(char):
            continue
        if CJK_RE.fullmatch(char):
            count += 1
            continue
        if char.isalpha() and ord(char) > 127:
            count += 1
    return count


def clause_language(clause: str) -> str:
    english_count = len(ENGLISH_RE.findall(clause))
    non_english_count = count_non_english_letters(clause)
    if english_count == 0 and non_english_count == 0:
        return "empty"
    if english_count > 0 and non_english_count == 0:
        return "english"
    if non_english_count > 0 and english_count == 0:
        return "non_english"
    if english_count >= non_english_count:
        return "english_mixed"
    return "non_english_mixed"


def clause_leading_script(clause: str) -> str:
    for char in clause:
        if ENGLISH_RE.fullmatch(char):
            return "english"
        if CJK_RE.fullmatch(char):
            return "cjk"
        if char.isalpha() and ord(char) > 127:
            return "non_english"
    return "unknown"


def first_meaningful_clause(text: str) -> tuple[str, str]:
    for raw_clause in CLAUSE_SPLIT_RE.split(text):
        clause = raw_clause.strip(" \t,-_()[]{}<>\"'`")
        if not clause:
            continue
        lang = clause_language(clause)
        if lang != "empty":
            return clause, lang
    return "", "empty"


def adjusted_non_english_count(text: str, fragment_threshold: int) -> int:
    if fragment_threshold <= 0:
        return count_non_english_letters(text)

    total = 0
    for raw_clause in CLAUSE_SPLIT_RE.split(text):
        clause = raw_clause.strip()
        if not clause:
            continue
        english_count = len(ENGLISH_RE.findall(clause))
        non_english_count = count_non_english_letters(clause)
        if (
            english_count > 0
            and 0 < non_english_count < fragment_threshold
        ):
            continue
        total += non_english_count
    return total


def decide(text: str, config: dict[str, object]) -> dict[str, object]:
    sanitized = strip_narrative_exemptions(
        text, bool(config["allow_cjk_in_code_or_paths"])
    )
    english_count = len(ENGLISH_RE.findall(sanitized))
    cjk_count = len(CJK_RE.findall(sanitized))
    fragment_threshold = int(config["ignore_short_cjk_fragments_under"])
    non_english_count = adjusted_non_english_count(sanitized, fragment_threshold)
    counted_letters = english_count + non_english_count
    ratio = 0.0 if counted_letters == 0 else non_english_count / counted_letters

    mode = str(config["mode"])
    allow_mixed = bool(config["allow_mixed_input"])
    max_ratio = float(config["max_non_english_ratio"])
    prefer_english_leading = bool(config["prefer_english_leading_narrative"])
    first_clause, first_clause_language_value = first_meaningful_clause(sanitized)
    first_clause_leading = clause_leading_script(first_clause)

    if counted_letters == 0:
        status = "ALLOW"
        reason = "No narrative language detected after ignoring code/path-like fragments."
    elif mode == "strict-english":
        if non_english_count == 0:
            status = "ALLOW"
            reason = "Strict mode passed because only English narrative text was counted."
        else:
            status = "REJECT"
            reason = "Strict mode rejects narrative non-English text."
    elif not allow_mixed and non_english_count > 0:
        status = "REJECT"
        reason = "Mixed-language input is disabled by policy."
    elif english_count == 0 and non_english_count > 0:
        status = "REJECT"
        reason = "No English narrative text was detected."
    elif prefer_english_leading and first_clause_leading in ("cjk", "non_english"):
        status = "REJECT"
        reason = "The first meaningful narrative clause starts with non-English text, so the prompt is not English-leading."
    elif prefer_english_leading and first_clause_language_value in (
        "non_english",
        "non_english_mixed",
    ):
        status = "REJECT"
        reason = "The first meaningful narrative clause is non-English, so the prompt is not English-leading."
    elif ratio > max_ratio:
        status = "REJECT"
        reason = "Non-English narrative text exceeds the configured ratio."
    else:
        status = "ALLOW"
        if cjk_count > 0:
            reason = "English remains dominant and the non-English narrative ratio is within policy."
        else:
            reason = "English-only or effectively English-dominant narrative text."

    return {
        "status": status,
        "mode": mode,
        "english_count": english_count,
        "non_english_count": non_english_count,
        "cjk_count": cjk_count,
        "counted_letters": counted_letters,
        "non_english_ratio": round(ratio, 4),
        "first_clause": first_clause,
        "first_clause_language": first_clause_language_value,
        "first_clause_leading": first_clause_leading,
        "reason": reason,
        "rejection_message": str(config["rejection_message"]),
    }


def main() -> int:
    args = parse_args()
    config = load_config(args.config)
    text = read_text(args)
    result = decide(text, config)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for key in (
            "status",
            "mode",
            "english_count",
            "non_english_count",
            "cjk_count",
            "counted_letters",
            "non_english_ratio",
            "first_clause",
            "first_clause_language",
            "first_clause_leading",
            "reason",
            "rejection_message",
        ):
            print(f"{key.upper()}={result[key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
