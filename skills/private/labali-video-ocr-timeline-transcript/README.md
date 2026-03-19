# labali-video-ocr-timeline-transcript Usage

This skill extracts all on-screen text from a local video with real timestamps using ffmpeg frame sampling and macOS Vision OCR, then produces overlap-based chunk files for LLM-assisted semantic merge into a clean timestamped transcript.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-video-ocr-timeline-transcript
```

Update to latest version: run the install command again.

## 2) Prerequisites

macOS only. Install dependencies before first run:

```bash
brew install ffmpeg
pip install pyobjc-framework-Vision pyobjc-framework-Cocoa
```

## 3) Quick Start

```bash
npx tsx skills/private/labali-video-ocr-timeline-transcript/scripts/run.ts \
  --video_path "/path/to/video.mp4"
```

Optional flags:
- `--output_dir "/path/to/output"` — default: `<video_stem>_ocr_timeline/` beside source video
- `--adaptive_mode smart` — frame extraction mode: `smart` (default), `hybrid`, or `fixed`
- `--fps 0.5` — base sampling fps (fixed/hybrid mode) or max-gap fallback rate (smart)
- `--scene 0.3` — scene-change threshold for adaptive extraction (default: `0.3`)
- `--languages "zh-Hans,zh-Hant,en"` — OCR language list (default: `zh-Hans,zh-Hant,en`)
- `--recognition_level accurate` — `accurate` (default) or `fast`
- `--chunk_size 80` — OCR rows per LLM merge chunk (default: `80`)
- `--chunk_overlap 10` — overlap rows between chunks (default: `10`)
- `--merge_similarity 0.9` — similarity threshold for near-duplicate OCR merge (default: `0.9`)
- `--merge_max_gap 2.0` — max seconds between rows to allow merge (default: `2.0`)
- `--debug` — keep all intermediate files (frames, raw/merged timelines, chunks)
- `--cleanup_frames` — delete extracted frame images after OCR

## 4) Two-Stage Pipeline

**Stage 1 — Local extraction (deterministic):**
1. Run `ffmpeg` with adaptive scene-change detection to extract keyframes and capture `pts_time` timestamps.
2. Run Vision OCR on each frame.
3. Merge near-duplicate OCR rows by similarity and time-gap.
4. Generate `merged_timeline.txt` and overlap-based `chunks/chunk_XXX_input.txt` files.

**Stage 2 — LLM merge (handled by current AI assistant):**
1. Feed each `chunks/chunk_XXX_input.txt` to the assistant using the `llm_merge_prompt_template.md` prompt.
2. Get chunk-level merged, deduplicated, time-indexed ranges.
3. Combine all chunk outputs into `final_transcript.md`.

## 5) Output Structure

Default (non-debug):

```text
<video_stem>_ocr_timeline/
  merged_timeline.txt
  final_transcript.md
```

Debug mode (`--debug`):

```text
<video_stem>_ocr_timeline/
  merged_timeline.txt
  final_transcript.md
  raw_timeline.txt
  raw_frames.jsonl
  merged_frames.jsonl
  chunk_manifest.json
  llm_merge_prompt_template.md
  chunks/
    chunk_001_input.txt
    chunk_002_input.txt
    ...
  frames/
    frame_0001.jpg
    ...
```

## 6) Limitations

1. **macOS only** — Vision.framework is not available on other platforms.
2. **LLM merge required** — Stage 1 generates chunks; Stage 2 requires the current AI assistant to produce `final_transcript.md`; it is not fully automated end-to-end.
3. **On-screen text only** — extracts visible text rendered in video frames; does not transcribe speech audio.
4. **Adaptive extraction accuracy** — scene-change threshold (`--scene`) may need tuning for low-contrast or fast-cut videos.

## 7) Troubleshooting

- `ffmpeg not found`: install with `brew install ffmpeg`.
- `ModuleNotFoundError: pyobjc-framework-Vision`: run `pip install pyobjc-framework-Vision pyobjc-framework-Cocoa`.
- Empty or sparse timeline: lower `--scene` threshold (e.g. `0.1`) or switch to `--adaptive_mode fixed` with explicit `--fps`.
- Too many duplicate OCR rows before merge: raise `--merge_similarity` (e.g. `0.95`) or lower `--merge_max_gap`.
- Re-run overwrites existing output folder automatically.
