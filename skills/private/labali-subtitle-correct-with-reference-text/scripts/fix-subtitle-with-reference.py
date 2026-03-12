#!/usr/bin/env python3
"""Correct subtitle text using a reference script while preserving original timestamps."""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import List


@dataclass
class Cue:
    timing: str
    text: str


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value)


def clean_reference_text(value: str) -> str:
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s{0,3}>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_~]", "", text)
    return text


def parse_srt(content: str) -> List[Cue]:
    blocks = re.split(r"\n\s*\n", content.strip(), flags=re.MULTILINE)
    cues: List[Cue] = []
    for block in blocks:
        lines = [line.rstrip("\r") for line in block.splitlines() if line.strip()]
        if not lines:
            continue

        line_idx = 0
        if re.fullmatch(r"\d+", lines[0].strip()):
            line_idx = 1
        if line_idx >= len(lines):
            continue

        timing = lines[line_idx].strip()
        if "-->" not in timing:
            continue
        text = " ".join(line.strip() for line in lines[line_idx + 1 :] if line.strip())
        cues.append(Cue(timing=timing, text=text))
    return cues


def parse_vtt(content: str) -> List[Cue]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    if lines and lines[0].strip().upper().startswith("WEBVTT"):
        lines = lines[1:]

    blocks = re.split(r"\n\s*\n", "\n".join(lines).strip(), flags=re.MULTILINE)
    cues: List[Cue] = []
    for block in blocks:
        rows = [row for row in block.splitlines() if row.strip()]
        if not rows:
            continue

        timing_idx = -1
        for idx, row in enumerate(rows):
            if "-->" in row:
                timing_idx = idx
                break
        if timing_idx < 0:
            continue

        timing = rows[timing_idx].strip()
        text_rows = rows[timing_idx + 1 :]
        text = " ".join(row.strip() for row in text_rows if row.strip())
        cues.append(Cue(timing=timing, text=text))
    return cues


def serialize_srt(cues: List[Cue]) -> str:
    out: List[str] = []
    for idx, cue in enumerate(cues, start=1):
        out.append(str(idx))
        out.append(cue.timing)
        out.append(cue.text)
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def serialize_vtt(cues: List[Cue]) -> str:
    out = ["WEBVTT", ""]
    for cue in cues:
        out.append(cue.timing)
        out.append(cue.text)
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def build_boundary_map(source: str, target: str) -> List[int]:
    matcher = SequenceMatcher(a=source, b=target, autojunk=False)
    boundaries: List[int | None] = [None] * (len(source) + 1)

    for tag, a1, a2, b1, b2 in matcher.get_opcodes():
        if tag == "equal":
            span = a2 - a1
            for i in range(span + 1):
                boundaries[a1 + i] = b1 + i
            continue

        if tag in {"replace", "delete"}:
            span = a2 - a1
            if span <= 0:
                continue
            for i in range(span + 1):
                mapped = b1 + round(i * (b2 - b1) / span)
                boundaries[a1 + i] = mapped
            continue

        if tag == "insert":
            if boundaries[a1] is None:
                boundaries[a1] = b2

    last = 0
    for i in range(len(boundaries)):
        value = boundaries[i]
        if value is None:
            boundaries[i] = last
        else:
            bounded = max(0, min(len(target), int(value)))
            boundaries[i] = bounded
            last = bounded

    for i in range(1, len(boundaries)):
        if boundaries[i] < boundaries[i - 1]:
            boundaries[i] = boundaries[i - 1]

    return [int(x) for x in boundaries]


def correct_cues(cues: List[Cue], reference_text: str) -> List[Cue]:
    source_parts = [normalize_text(cue.text) for cue in cues]
    source = "".join(source_parts)
    target = normalize_text(reference_text)

    if not source or not target:
        return cues

    boundaries = build_boundary_map(source, target)

    output: List[Cue] = []
    offset = 0
    for cue, src_part in zip(cues, source_parts):
        start = offset
        end = offset + len(src_part)
        offset = end

        if len(src_part) == 0:
            output.append(Cue(timing=cue.timing, text=cue.text))
            continue

        t_start = boundaries[start]
        t_end = boundaries[end]
        if t_end < t_start:
            t_start, t_end = t_end, t_start

        corrected = target[t_start:t_end]
        if not corrected:
            corrected = src_part
        else:
            # Keep original cue when mapped slice is suspiciously short.
            # This prevents accidental text deletion when reference text misses segments.
            min_len = max(2, int(len(src_part) * 0.6))
            if len(corrected) < min_len:
                corrected = src_part
            else:
                similarity = SequenceMatcher(
                    a=src_part,
                    b=corrected,
                    autojunk=False,
                ).ratio()
                if len(src_part) >= 8 and similarity < 0.18:
                    corrected = src_part

        output.append(Cue(timing=cue.timing, text=corrected))

    return rebalance_leading_punctuation(output)


def rebalance_leading_punctuation(cues: List[Cue]) -> List[Cue]:
    if len(cues) <= 1:
        return cues

    movable = set("，。！？；：、,.!?;:)]）】》」』”’")
    keep_at_start = set("\"'“‘「『《（【([{")

    out = [Cue(timing=cue.timing, text=cue.text) for cue in cues]
    for i in range(1, len(out)):
        cur = out[i].text.lstrip()
        if not cur:
            continue
        moved = ""
        while cur and cur[0] in movable and cur[0] not in keep_at_start:
            moved += cur[0]
            cur = cur[1:]
        if moved:
            out[i - 1].text = (out[i - 1].text.rstrip() + moved).strip()
            out[i].text = cur.strip()

    for i in range(len(out)):
        if not out[i].text:
            out[i].text = cues[i].text
    return out


def detect_format(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".srt":
        return "srt"
    if ext == ".vtt":
        return "vtt"
    raise ValueError("Only .srt and .vtt are supported")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Correct subtitle text with reference script while preserving timeline"
    )
    parser.add_argument("--subtitle_path", required=True, help="Input subtitle file (.srt or .vtt)")
    parser.add_argument("--reference_path", required=True, help="Reference text file with correct wording")
    parser.add_argument("--output_path", required=False, help="Output subtitle file path")

    args = parser.parse_args()

    subtitle_path = Path(args.subtitle_path).expanduser().resolve()
    reference_path = Path(args.reference_path).expanduser().resolve()

    if not subtitle_path.exists():
        raise FileNotFoundError(f"Subtitle file not found: {subtitle_path}")
    if not reference_path.exists():
        raise FileNotFoundError(f"Reference file not found: {reference_path}")

    file_format = detect_format(subtitle_path)
    output_path = (
        Path(args.output_path).expanduser().resolve()
        if args.output_path
        else subtitle_path.with_name(f"{subtitle_path.stem}.corrected{subtitle_path.suffix}")
    )

    subtitle_content = subtitle_path.read_text(encoding="utf-8")
    reference_content = clean_reference_text(reference_path.read_text(encoding="utf-8"))

    cues = parse_srt(subtitle_content) if file_format == "srt" else parse_vtt(subtitle_content)
    if not cues:
        raise ValueError("No subtitle cues parsed from input file")

    corrected = correct_cues(cues, reference_content)
    serialized = serialize_srt(corrected) if file_format == "srt" else serialize_vtt(corrected)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(serialized, encoding="utf-8")

    print(f"subtitle_path={subtitle_path}")
    print(f"reference_path={reference_path}")
    print(f"output_path={output_path}")
    print(f"format={file_format}")
    print(f"cue_count={len(corrected)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
