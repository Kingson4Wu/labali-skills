---
name: labali-video-desensitize
description: >-
  Sanitize local video files by mandatory two-pass local FFmpeg re-encode with
  metadata/chapter removal, bitexact flags, audio re-encode, MP4 container
  hardening, and default watermark-resistance transforms (higher CRF + mild
  scale perturbation), then print before/after diagnostics, metadata diffs, and
  post-sanitize hidden-metadata sensitive-info scan. Use when you need to strip
  metadata, remove tracking watermarks, or sanitize local video files with
  deterministic FFmpeg re-encode. Input: video path + output path.
license: MIT
compatibility: macOS / Linux; requires ffmpeg and exiftool in PATH; sufficient disk space for two-pass re-encode.
allowed-tools: "Bash(ffmpeg:*), Bash(exiftool:*), Bash(bash:*)"
metadata:
  pattern: pipeline
  sub-pattern: reviewer
---

# labali-video-desensitize

Treat this skill as a layered system.

## Layer Contract

1. `SKILL.md` is the policy layer.
2. `references/architecture.md` is the strategy layer.
3. `scripts/sanitize-video.sh` is the execution layer.

## NEVER

- Never skip the two-pass encode — single-pass re-encode does not reliably strip all metadata.
- Never claim full forensic erasure — this method is practical-risk reduction only; state this explicitly in the result.
- Never overwrite or delete the input file — always write to a separate output path.

## Pipeline Steps

Execute in fixed order:

**Step 1 — Validate prerequisites**
- Confirm `ffmpeg`, `ffprobe`, and `exiftool` are available in PATH.
- Fail fast with explicit error if any is missing.
- Confirm input video path is readable and sufficient disk space exists for two-pass re-encode.

**Step 2 — FFmpeg two-pass re-encode**
- Run `scripts/sanitize-video.sh` with input and output paths.
- Pass 1: transcode to intermediate mp4 with watermark-resistance transforms:
  - `-vf "scale=trunc(iw*0.98/2)*2:trunc(ih*0.98/2)*2,scale=trunc(iw/0.98/2)*2:trunc(ih/0.98/2)*2"`
  - `-c:v libx264 -crf 28 -c:a aac -b:a 128k`
- Pass 2: sanitize from intermediate to output:
  - `-map_metadata -1 -map_chapters -1`
  - `-fflags +bitexact -flags:v +bitexact -flags:a +bitexact`
  - `-movflags +faststart -write_tmcd 0`
- Remove intermediate file after pass 2 completes.

**Step 3 — Diagnostics**
- Print before/after comparison:
  - file size,
  - duration,
  - dimensions,
  - EXIF line count,
  - SHA256 hash,
  - EXIF diff,
  - ffprobe format-tag diff.

**Step 4 — Reviewer: sensitive metadata scan**
- Run post-sanitize hidden metadata scan on output video via `scripts/check-sensitive-video-info.sh`.
- Check EXIF/container metadata for sensitive key/value patterns.
- Print `Sensitive info review: PASS|REVIEW_REQUIRED`.

**Step 5 — Return result**
- Load `references/risk-notes.md` before writing the result caveats to ensure the framing is accurate.
- State clearly: this method is practical-risk reduction, not 100% forensic erasure.
- State clearly: default stronger transforms improve disruption odds for platform watermarking but cannot guarantee full removal.
- In normal mode: report verdict and summary.
- In `--strict` mode: exit non-zero when suspicious metadata candidates are detected.

## Success Criteria

A run is successful only when all conditions hold:

1. Input video is readable.
2. Output video is generated at target path.
3. Before/after diagnostics are printed.
4. EXIF and ffprobe diff sections are printed (empty diff is acceptable).
5. Post-sanitize sensitive metadata scan section is printed.
6. In strict mode, suspicious hidden metadata produces non-zero exit.
7. Intermediate file is removed after completion.

## Runtime Inputs

Use `skill.yaml` as input schema source of truth.

## Operational Mode

- Deterministic local shell execution only.
- No browser, no network, no API.
- Keep output reproducible and script-driven.
- State clearly that this method is practical-risk reduction, not 100% forensic erasure.
- State clearly that default stronger transforms improve disruption odds for platform watermarking, but cannot guarantee full removal.

## Resources

- Architecture: `references/architecture.md`
- Workflow plan: `references/plan.md`
- Risk notes: `references/risk-notes.md`
- Deterministic script: `scripts/sanitize-video.sh`
- Post-check script: `scripts/check-sensitive-video-info.sh`
- Optional CLI wrapper: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
