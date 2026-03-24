---
name: labali-video-ocr-timeline-transcript
description: Extract full text from local video frames with real timestamps using ffmpeg keyframe sampling and native macOS Vision OCR, then prepare overlap-based LLM merge chunks to produce a clean timestamped transcript. Use when you want on-screen text from a video (screen recording, lecture, tutorial, or any video with visible text) turned into a time-indexed transcript. Also known as video-to-text or video OCR.
license: MIT
compatibility: macOS only (10.15 Catalina or later); requires ffmpeg in PATH and Python 3 with pyobjc-framework-Vision; Node.js ≥ 18 + tsx; Vision.framework provided by macOS.
allowed-tools: "Bash(ffmpeg:*), Bash(npx:*), Bash(uv:*), Bash(python3:*)"
metadata:
  pattern: pipeline
---

# labali-video-ocr-timeline-transcript

Treat this skill as a deterministic local pipeline plus LLM merge handoff.

## Required Constraints

- Run on macOS only.
- Use `ffmpeg` for frame extraction and timestamp capture from `showinfo` `pts_time`.
- Default frame extraction to adaptive mode (`smart`): scene change driven with dynamic max-gap fallback and sparse-result auto-retry.
- Use `Vision.framework` via `pyobjc` for OCR.
- Keep all OCR results first, do not rule-based deduplicate before LLM merge.
- Run fine-grained extraction first, then merge near-duplicate OCR rows by similarity and time-gap.
- Generate overlapped chunk files for LLM semantic merge.
- Default to non-debug output cleanup: keep final files only in `<video_stem>_ocr_timeline`.
- If `--debug` is set, keep full intermediate artifacts for inspection.
- Re-runs overwrite the same output folder by deleting existing contents first, then regenerating.
- LLM merge stage should be executed by the current AI assistant (Codex/Gemini), not a hardcoded provider SDK.

## NEVER

- Never run on non-macOS — Vision.framework is not available on other platforms; fail fast with an explicit error.
- Never proceed to the final merge step until all chunk files have been processed and chunk-level outputs collected.
- Never interpolate timestamps from frame index — time ranges must come from parsed `pts_time` values only.

## Setup

Install dependencies before first run:

```bash
brew install ffmpeg
pip install pyobjc-framework-Vision pyobjc-framework-Cocoa
```

## Runtime Inputs

Use `skill.yaml` as input schema source of truth.

## Execution

Run:

```bash
npx tsx skills/private/labali-video-ocr-timeline-transcript/scripts/run.ts \
  --video_path "/path/to/video.mp4" \
  [--output_dir "/path/to/output"] \
  [--adaptive_mode smart] \
  [--fps 0.5] \
  [--scene 0.3] \
  [--max_gap 0.8] \
  [--languages "zh-Hans,zh-Hant,en"] \
  [--recognition_level accurate] \
  [--chunk_size 80] \
  [--chunk_overlap 10] \
  [--merge_similarity 0.9] \
  [--merge_max_gap 2.0] \
  [--debug] \
  [--image_format jpg] \
  [--cleanup_frames]
```

Wrapper delegates to:

- `scripts/video-ocr-timeline.py`

## Outputs

Default output folder: `<video_stem>_ocr_timeline/`

- Non-debug mode (default) keeps:
  - `merged_timeline.txt`
  - `final_transcript.md`
- Debug mode (`--debug`) additionally keeps:
  - `raw_timeline.txt`
  - `raw_frames.jsonl`
  - `merged_frames.jsonl`
  - `chunks/chunk_XXX_input.txt`
  - `chunk_manifest.json`
  - `llm_merge_prompt_template.md`
  - extracted `frames/`

## LLM Merge Workflow

1. Run script to generate raw timeline and chunk files.
2. > If the merge behavior or chunk strategy is unclear, load `references/architecture.md` before processing chunks.

   Feed each `chunks/chunk_XXX_input.txt` to current assistant with `llm_merge_prompt_template.md`.
   **DO NOT proceed to Step 3 until ALL chunk files have been processed and chunk-level outputs collected.**
3. Get chunk-level merged ranges.
4. Merge chunk outputs once again into `final_transcript.md`.

## Success Criteria

A run is successful only when all conditions hold:

1. Video exists and ffmpeg extraction completes.
2. OCR completes via Vision without API error.
3. Timeline outputs and chunk files are generated.
4. Time ranges come from parsed `pts_time`, not frame index interpolation.
5. Assistant can use generated chunks to produce clean timestamped transcript.
