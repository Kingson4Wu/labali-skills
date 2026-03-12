#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple


SHOWINFO_RE = re.compile(r"showinfo.*pts_time:([0-9]+(?:\.[0-9]+)?)")


@dataclass
class FrameOCR:
    index: int
    image_path: Path
    pts_time: float
    text: str


@dataclass
class MergedOCR:
    start_pts: float
    end_pts: float
    text: str


def ensure_macos() -> None:
    if sys.platform != "darwin":
        raise RuntimeError("This script requires macOS (Vision.framework).")


def ensure_dependency(name: str) -> None:
    from shutil import which

    if which(name) is None:
        raise RuntimeError(f"Missing dependency: {name}")


def format_ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    ms = int(round(seconds * 1000))
    h = ms // 3600000
    ms %= 3600000
    m = ms // 60000
    ms %= 60000
    s = ms // 1000
    ms %= 1000
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"
    return f"{m:02d}:{s:02d}.{ms:03d}"


def get_video_duration_seconds(video_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe failed with exit code {res.returncode}")
    try:
        value = float(res.stdout.strip())
    except ValueError as exc:
        raise RuntimeError("Failed to parse video duration from ffprobe output.") from exc
    if value <= 0:
        raise RuntimeError("Invalid video duration from ffprobe.")
    return value


def clear_old_frames(frames_dir: Path, image_format: str) -> None:
    for p in frames_dir.glob(f"frame_*.{image_format}"):
        p.unlink(missing_ok=True)


def reset_output_dir(output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)


def build_filter_expression(mode: str, scene: float, fps: float, max_gap: float) -> str:
    if mode == "fixed":
        if fps <= 0:
            raise ValueError("fps must be > 0 when adaptive_mode=fixed")
        return f"fps={fps},showinfo"

    if max_gap <= 0:
        raise ValueError("max_gap must be > 0 when adaptive_mode is hybrid/smart")
    return f"select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,{max_gap})+gt(scene\\,{scene})',showinfo"


def ffmpeg_extract_frames(
    video_path: Path,
    frames_dir: Path,
    scene: float,
    fps: float,
    max_gap: float,
    mode: str,
    image_format: str,
) -> List[float]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    clear_old_frames(frames_dir, image_format)
    frame_pattern = str(frames_dir / f"frame_%06d.{image_format}")

    vf = build_filter_expression(mode, scene, fps, max_gap)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        vf,
        "-vsync",
        "vfr",
        frame_pattern,
    ]

    print("[1/3] Extract frames with ffmpeg...")
    print(" ".join(cmd))

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    pts_times: List[float] = []
    assert proc.stderr is not None
    for line in proc.stderr:
        m = SHOWINFO_RE.search(line)
        if m:
            pts_times.append(float(m.group(1)))

    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"ffmpeg failed with exit code {code}")

    return pts_times


def choose_smart_params(duration_seconds: float, scene: float, max_gap: float) -> Tuple[float, float]:
    if max_gap > 0:
        gap = max_gap
    elif duration_seconds <= 60:
        gap = 0.18
    elif duration_seconds <= 180:
        gap = 0.22
    elif duration_seconds <= 600:
        gap = 0.30
    else:
        gap = 0.45

    tuned_scene = max(0.10, min(0.40, scene * 0.9))
    return tuned_scene, gap


def normalize_ocr_text(text: str) -> str:
    merged = " ".join(text.split())
    merged = re.sub(r"[\\s\\-_:：，,。.；;！？!\\[\\]\\(\\)]+", "", merged)
    return merged.lower()


def choose_better_text(a: str, b: str) -> str:
    if len(b) > len(a):
        return b
    return a


def is_similar_text(a: str, b: str, threshold: float) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    ratio = difflib.SequenceMatcher(None, a, b).ratio()
    return ratio >= threshold


def merge_duplicate_frames(items: List[FrameOCR], similarity: float, max_gap: float) -> List[MergedOCR]:
    if not items:
        return []

    merged: List[MergedOCR] = []
    current = MergedOCR(start_pts=items[0].pts_time, end_pts=items[0].pts_time, text=items[0].text)
    current_norm = normalize_ocr_text(items[0].text)

    for item in items[1:]:
        text_norm = normalize_ocr_text(item.text)
        time_gap = item.pts_time - current.end_pts
        if time_gap <= max_gap and is_similar_text(current_norm, text_norm, similarity):
            current.end_pts = item.pts_time
            current.text = choose_better_text(current.text, item.text)
            current_norm = normalize_ocr_text(current.text)
            continue

        merged.append(current)
        current = MergedOCR(start_pts=item.pts_time, end_pts=item.pts_time, text=item.text)
        current_norm = text_norm

    merged.append(current)
    return merged


def vision_ocr(image_path: Path, languages: List[str], recognition_level: str) -> str:
    import Vision  # type: ignore
    from Foundation import NSURL  # type: ignore

    url = NSURL.fileURLWithPath_(str(image_path))
    results: List[str] = []

    def handler(request, error):
        if error:
            return
        observations = request.results() or []
        for obs in observations:
            candidates = obs.topCandidates_(1)
            if candidates and len(candidates) > 0:
                results.append(str(candidates[0].string()))

    request = Vision.VNRecognizeTextRequest.alloc().initWithCompletionHandler_(handler)
    request.setRecognitionLanguages_(languages)
    if recognition_level == "accurate":
        request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    else:
        request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelFast)

    if hasattr(request, "setUsesLanguageCorrection_"):
        request.setUsesLanguageCorrection_(True)

    handler_obj = Vision.VNImageRequestHandler.alloc().initWithURL_options_(url, {})
    ok, err = handler_obj.performRequests_error_([request], None)
    if ok is False:
        raise RuntimeError(f"Vision OCR failed for {image_path}: {err}")

    return "\n".join(results).strip()


def map_pts_to_frames(frame_paths: List[Path], pts_times: List[float], fps: float) -> List[float]:
    if len(frame_paths) == len(pts_times):
        return pts_times

    mapped: List[float] = []
    fallback_step = 1.0 / fps if fps > 0 else 2.0
    print(
        f"[warn] showinfo count ({len(pts_times)}) != frame count ({len(frame_paths)}), apply fallback mapping"
    )

    for i in range(len(frame_paths)):
        if i < len(pts_times):
            mapped.append(pts_times[i])
        elif mapped:
            mapped.append(mapped[-1] + fallback_step)
        else:
            mapped.append(i * fallback_step)
    return mapped


def write_outputs(
    output_dir: Path,
    items: List[FrameOCR],
    merged_items: List[MergedOCR],
    chunk_size: int,
    overlap: int,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    raw_jsonl = output_dir / "raw_frames.jsonl"
    raw_timeline = output_dir / "raw_timeline.txt"
    merged_jsonl = output_dir / "merged_frames.jsonl"
    merged_timeline = output_dir / "merged_timeline.txt"
    chunks_dir = output_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    with raw_jsonl.open("w", encoding="utf-8") as jf:
        for item in items:
            row = {
                "index": item.index,
                "pts_time": round(item.pts_time, 3),
                "timestamp": format_ts(item.pts_time),
                "image": item.image_path.name,
                "text": item.text,
            }
            jf.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Collapse neighboring near-duplicate OCR lines for a cleaner raw timeline.
    raw_collapsed = merge_duplicate_frames(items, similarity=0.98, max_gap=0.6)
    with raw_timeline.open("w", encoding="utf-8") as tf:
        for item in raw_collapsed:
            single_line = " ".join(item.text.splitlines()).strip()
            if item.end_pts > item.start_pts:
                tf.write(f"[{format_ts(item.start_pts)} ~ {format_ts(item.end_pts)}] {single_line}\n")
            else:
                tf.write(f"[{format_ts(item.start_pts)}] {single_line}\n")

    with merged_jsonl.open("w", encoding="utf-8") as jf, merged_timeline.open("w", encoding="utf-8") as tf:
        for idx, item in enumerate(merged_items, start=1):
            row = {
                "index": idx,
                "start_pts": round(item.start_pts, 3),
                "end_pts": round(item.end_pts, 3),
                "start_time": format_ts(item.start_pts),
                "end_time": format_ts(item.end_pts),
                "text": item.text,
            }
            jf.write(json.dumps(row, ensure_ascii=False) + "\n")
            single_line = " ".join(item.text.splitlines()).strip()
            tf.write(f"[{format_ts(item.start_pts)} ~ {format_ts(item.end_pts)}] {single_line}\n")

    final_transcript = output_dir / "final_transcript.md"
    with final_transcript.open("w", encoding="utf-8") as f:
        f.write("# Final Transcript\n\n")
        for item in merged_items:
            single_line = " ".join(item.text.splitlines()).strip()
            f.write(f"[{format_ts(item.start_pts)} ~ {format_ts(item.end_pts)}]\n")
            f.write(f"{single_line}\n\n")

    stride = max(1, chunk_size - overlap)
    chunk_meta = []
    chunk_idx = 1

    for start in range(0, len(merged_items), stride):
        chunk = merged_items[start : start + chunk_size]
        if not chunk:
            continue

        chunk_file = chunks_dir / f"chunk_{chunk_idx:03d}_input.txt"
        with chunk_file.open("w", encoding="utf-8") as f:
            for item in chunk:
                line = " ".join(item.text.splitlines()).strip()
                f.write(f"[{format_ts(item.start_pts)} ~ {format_ts(item.end_pts)}] {line}\n")

        chunk_meta.append(
            {
                "chunk": chunk_idx,
                "start_index": start,
                "end_index": start + len(chunk) - 1,
                "start_time": format_ts(chunk[0].start_pts),
                "end_time": format_ts(chunk[-1].end_pts),
                "file": chunk_file.name,
            }
        )
        chunk_idx += 1

        if start + chunk_size >= len(merged_items):
            break

    with (output_dir / "chunk_manifest.json").open("w", encoding="utf-8") as f:
        json.dump(chunk_meta, f, ensure_ascii=False, indent=2)

    prompt_template = output_dir / "llm_merge_prompt_template.md"
    prompt_template.write_text(
        """You are given OCR lines extracted from video frames.

Goals:
1. Merge duplicate or partial OCR lines that refer to the same semantic content.
2. Restore the cleanest complete sentence(s).
3. Merge timestamps into segment ranges.
4. Keep output concise and faithful to source meaning.

Output format:
[MM:SS.mmm ~ MM:SS.mmm]
clean merged text

Input chunk:
```
<paste chunk file content here>
```
""",
        encoding="utf-8",
    )


def cleanup_frames(frames_dir: Path) -> None:
    for p in frames_dir.glob("frame_*.*"):
        p.unlink(missing_ok=True)


def cleanup_intermediate_outputs(output_dir: Path) -> None:
    frames_dir = output_dir / "frames"
    if frames_dir.exists():
        for p in frames_dir.glob("*"):
            p.unlink(missing_ok=True)
        try:
            frames_dir.rmdir()
        except OSError:
            pass

    files_to_remove = [
        output_dir / "raw_frames.jsonl",
        output_dir / "raw_timeline.txt",
        output_dir / "merged_frames.jsonl",
        output_dir / "chunk_manifest.json",
        output_dir / "llm_merge_prompt_template.md",
    ]
    for p in files_to_remove:
        p.unlink(missing_ok=True)

    chunks_dir = output_dir / "chunks"
    if chunks_dir.exists():
        for p in chunks_dir.glob("*"):
            p.unlink(missing_ok=True)
        try:
            chunks_dir.rmdir()
        except OSError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract video text with timeline using ffmpeg keyframes + macOS Vision OCR."
    )
    parser.add_argument("--video_path", required=True)
    parser.add_argument("--output_dir", default="")
    parser.add_argument("--fps", type=float, default=0.5)
    parser.add_argument("--scene", type=float, default=0.3)
    parser.add_argument("--adaptive_mode", default="smart", choices=["smart", "hybrid", "fixed"])
    parser.add_argument("--max_gap", type=float, default=0.0)
    parser.add_argument("--languages", default="zh-Hans,zh-Hant,en")
    parser.add_argument("--recognition_level", default="accurate", choices=["accurate", "fast"])
    parser.add_argument("--chunk_size", type=int, default=80)
    parser.add_argument("--chunk_overlap", type=int, default=10)
    parser.add_argument("--merge_similarity", type=float, default=0.90)
    parser.add_argument("--merge_max_gap", type=float, default=2.0)
    parser.add_argument("--image_format", default="jpg", choices=["jpg", "png", "webp"])
    parser.add_argument("--cleanup_frames", action="store_true")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    ensure_macos()
    ensure_dependency("ffmpeg")
    ensure_dependency("ffprobe")

    video_path = Path(args.video_path).expanduser().resolve()
    if not video_path.exists() or not video_path.is_file():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    if args.chunk_size < 1:
        raise ValueError("chunk_size must be >= 1")
    if args.chunk_overlap < 0:
        raise ValueError("chunk_overlap must be >= 0")
    if args.chunk_overlap >= args.chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")
    if args.fps <= 0:
        raise ValueError("fps must be > 0")
    if args.max_gap < 0:
        raise ValueError("max_gap must be >= 0")
    if args.scene < 0:
        raise ValueError("scene must be >= 0")
    if args.merge_similarity <= 0 or args.merge_similarity > 1:
        raise ValueError("merge_similarity must be in (0, 1]")
    if args.merge_max_gap < 0:
        raise ValueError("merge_max_gap must be >= 0")

    stem = video_path.stem
    if args.output_dir:
        output_dir = Path(args.output_dir).expanduser().resolve()
    else:
        output_dir = video_path.parent / f"{stem}_ocr_timeline"
    reset_output_dir(output_dir)

    frames_dir = output_dir / "frames"
    languages = [x.strip() for x in args.languages.split(",") if x.strip()]

    duration_seconds = get_video_duration_seconds(video_path)

    selected_scene = args.scene
    selected_gap = args.max_gap if args.max_gap > 0 else (1.0 / args.fps)

    if args.adaptive_mode == "smart":
        selected_scene, selected_gap = choose_smart_params(duration_seconds, args.scene, args.max_gap)
        print(
            f"[adaptive] mode=smart, duration={duration_seconds:.2f}s, scene={selected_scene:.3f}, max_gap={selected_gap:.3f}s"
        )
    elif args.adaptive_mode == "hybrid":
        if args.max_gap <= 0:
            selected_gap = 1.0 / args.fps
        print(f"[adaptive] mode=hybrid, scene={selected_scene:.3f}, max_gap={selected_gap:.3f}s")
    else:
        print(f"[adaptive] mode=fixed, fps={args.fps:.3f}")

    pts_times = ffmpeg_extract_frames(
        video_path=video_path,
        frames_dir=frames_dir,
        scene=selected_scene,
        fps=args.fps,
        max_gap=selected_gap,
        mode=args.adaptive_mode,
        image_format=args.image_format,
    )

    frame_paths = sorted(frames_dir.glob(f"frame_*.{args.image_format}"))
    if not frame_paths:
        raise RuntimeError("No frames extracted. Try reducing --scene or increasing --fps.")

    if args.adaptive_mode == "smart":
        expected_floor = max(1, int(duration_seconds / selected_gap * 0.6))
        if len(frame_paths) < expected_floor:
            retry_scene = max(0.08, selected_scene * 0.7)
            retry_gap = max(0.08, selected_gap * 0.65)
            print(
                f"[adaptive] sparse extraction detected (frames={len(frame_paths)}, expected>={expected_floor}), retry with scene={retry_scene:.3f}, max_gap={retry_gap:.3f}s"
            )
            pts_times = ffmpeg_extract_frames(
                video_path=video_path,
                frames_dir=frames_dir,
                scene=retry_scene,
                fps=args.fps,
                max_gap=retry_gap,
                mode="hybrid",
                image_format=args.image_format,
            )
            frame_paths = sorted(frames_dir.glob(f"frame_*.{args.image_format}"))

    mapped_pts = map_pts_to_frames(frame_paths, pts_times, args.fps)

    print(f"[2/3] OCR frames with Vision... total={len(frame_paths)}")
    items: List[FrameOCR] = []
    for idx, frame_path in enumerate(frame_paths):
        text = vision_ocr(frame_path, languages, args.recognition_level)
        if not text:
            continue
        items.append(FrameOCR(index=idx, image_path=frame_path, pts_time=mapped_pts[idx], text=text))

    if not items:
        raise RuntimeError("OCR produced no text from extracted frames.")

    merged_items = merge_duplicate_frames(items, similarity=args.merge_similarity, max_gap=args.merge_max_gap)
    print(f"[dedupe] raw={len(items)}, merged={len(merged_items)}")

    print("[3/3] Write timeline outputs...")
    write_outputs(output_dir, items, merged_items, args.chunk_size, args.chunk_overlap)

    if args.cleanup_frames:
        cleanup_frames(frames_dir)
        try:
            frames_dir.rmdir()
        except OSError:
            pass

    if not args.debug:
        cleanup_intermediate_outputs(output_dir)
        print("[cleanup] non-debug mode: removed intermediate artifacts, kept final outputs only.")

    print(f"Done: {output_dir}")
    if args.debug:
        print(f"- raw timeline: {output_dir / 'raw_timeline.txt'}")
        print(f"- frame jsonl:  {output_dir / 'raw_frames.jsonl'}")
        print(f"- chunks dir:   {output_dir / 'chunks'}")
    print(f"- merged timeline: {output_dir / 'merged_timeline.txt'}")
    print(f"- final file:   {output_dir / 'final_transcript.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
