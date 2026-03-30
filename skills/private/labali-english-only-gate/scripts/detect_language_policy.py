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
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]*)\]\([^\)]*\)")
MARKDOWN_HEADING_RE = re.compile(r"^#{1,6}\s+.*$", re.MULTILINE)
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
# Script-specific non-English character classes
HANGUL_RE = re.compile(r"[\uac00-\ud7af]")          # Korean Hangul
ARABIC_RE = re.compile(r"[\u0600-\u06ff]")           # Arabic
DEVANAGARI_RE = re.compile(r"[\u0900-\u097f]")        # Hindi, Sanskrit
CYRILLIC_RE = re.compile(r"[\u0400-\u04ff]")          # Russian, Ukrainian
THAI_RE = re.compile(r"[\u0e00-\u0e7f]")              # Thai
LATIN_EXTENDED_RE = re.compile(r"[\u00c0-\u024f]")     # French/Polish/Czech accents
ENGLISH_RE = re.compile(r"[A-Za-z]")
CLAUSE_SPLIT_RE = re.compile(r"[\n\r.!?;:。！？；：]+")


def debug_trace(
    original: str,
    sanitized: str,
    english_count: int,
    script_breakdown: dict[str, int],
    counted_letters: int,
    non_english_count: int,
    ratio: float,
    status: str,
    reason: str,
    config: dict[str, object],
) -> None:
    print("=== DEBUG TRACE ===", file=sys.stderr)
    print(f"[1] ORIGINAL TEXT ({len(original)} chars):", file=sys.stderr)
    print(f"    {repr(original[:200])}", file=sys.stderr)
    print(f"[2] AFTER SANITIZATION ({len(sanitized)} chars):", file=sys.stderr)
    print(f"    {repr(sanitized[:200])}", file=sys.stderr)
    print(f"[3] ENGLISH LETTERS: {english_count}", file=sys.stderr)
    print(f"[4] NON-ENGLISH LETTERS (by script):", file=sys.stderr)
    for script, count in sorted(script_breakdown.items()):
        if count > 0:
            print(f"    {script}: {count}", file=sys.stderr)
    print(f"[5] COUNTED LETTERS: {counted_letters}", file=sys.stderr)
    print(f"[6] RATIO: {non_english_count}/{counted_letters} = {ratio:.4f}", file=sys.stderr)
    max_ratio = config.get("max_non_english_ratio", config.get("max_ratio", "unknown"))
    print(f"[7] MAX RATIO (from config): {max_ratio}", file=sys.stderr)
    print(f"[8] STATUS: {status}", file=sys.stderr)
    print(f"    REASON: {reason}", file=sys.stderr)
    print("===================", file=sys.stderr)


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
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Print step-by-step sanitization and counting trace",
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
    # Step 1: Replace fenced code blocks with marker tokens (preserves surrounding whitespace)
    sanitized = CODE_BLOCK_RE.sub(" [CODE_BLOCK] ", text)
    # Step 2: Replace inline code spans with marker tokens
    sanitized = INLINE_CODE_RE.sub(" [CODE] ", sanitized)
    # Step 3: Strip markdown link text but keep URL context neutral
    sanitized = MARKDOWN_LINK_RE.sub(" [LINK] ", sanitized)
    # Step 4: Strip markdown headings entirely (the heading text is not narrative)
    sanitized = MARKDOWN_HEADING_RE.sub(" ", sanitized)
    if allow_cjk_in_code_or_paths:
        sanitized = URL_RE.sub(" ", sanitized)
        sanitized = PATH_TOKEN_RE.sub(" ", sanitized)
    return sanitized


def count_non_english_letters(text: str) -> tuple[int, dict[str, int]]:
    breakdown: dict[str, int] = {
        "cjk": 0,
        "hangul": 0,
        "arabic": 0,
        "devanagari": 0,
        "cyrillic": 0,
        "thai": 0,
        "latin_extended": 0,
        "other": 0,
    }
    total = 0
    for char in text:
        if ENGLISH_RE.fullmatch(char):
            continue
        matched = False
        for name, regex in (
            ("cjk", CJK_RE),
            ("hangul", HANGUL_RE),
            ("arabic", ARABIC_RE),
            ("devanagari", DEVANAGARI_RE),
            ("cyrillic", CYRILLIC_RE),
            ("thai", THAI_RE),
            ("latin_extended", LATIN_EXTENDED_RE),
        ):
            if regex.fullmatch(char):
                breakdown[name] += 1
                matched = True
                break
        if not matched:
            if char.isalpha() and ord(char) > 127:
                breakdown["other"] += 1
                matched = True
        if matched:
            total += 1
    return total, breakdown


def clause_language(clause: str) -> str:
    english_count = len(ENGLISH_RE.findall(clause))
    non_english_count, _ = count_non_english_letters(clause)
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
        total, _ = count_non_english_letters(text)
        return total

    total = 0
    for raw_clause in CLAUSE_SPLIT_RE.split(text):
        clause = raw_clause.strip()
        if not clause:
            continue
        english_count = len(ENGLISH_RE.findall(clause))
        non_english_count, breakdown = count_non_english_letters(clause)
        # Only skip pure-CJK short fragments; non-CJK non-English chars always count
        cjk_count = breakdown["cjk"]
        non_cjk_non_english = non_english_count - cjk_count
        if (
            english_count > 0
            and non_cjk_non_english == 0
            and 0 < cjk_count < fragment_threshold
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
    _, script_breakdown = count_non_english_letters(sanitized)

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
        if ratio >= (max_ratio - 0.03):
            status = "WARNING"
            reason = (
                f"English is dominant but non-English ratio ({ratio:.2f}) "
                f"is within 0.03 of the {max_ratio} threshold. Proceed with caution."
            )
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
        "script_breakdown": script_breakdown,
        "reason": reason,
        "rejection_message": str(config["rejection_message"]),
    }


def main() -> int:
    args = parse_args()
    config = load_config(args.config)
    text = read_text(args)
    result = decide(text, config)

    sanitized = strip_narrative_exemptions(
        text, bool(config["allow_cjk_in_code_or_paths"])
    )
    if args.debug:
        debug_trace(
            original=text,
            sanitized=sanitized,
            english_count=result["english_count"],
            script_breakdown=result.get("script_breakdown", {}),
            counted_letters=result["counted_letters"],
            non_english_count=result["non_english_count"],
            ratio=result["non_english_ratio"],
            status=result["status"],
            reason=result["reason"],
            config=config,
        )

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
