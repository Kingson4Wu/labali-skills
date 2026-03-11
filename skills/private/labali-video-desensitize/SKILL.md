---
name: labali-video-desensitize
description: Sanitize local video files by mandatory two-pass local FFmpeg re-encode with metadata/chapter removal, bitexact flags, audio re-encode, MP4 container hardening, and default watermark-resistance transforms (higher CRF + mild scale perturbation), then print before/after diagnostics, metadata diffs, and post-sanitize hidden-metadata sensitive-info scan. Use when users need practical video metadata desensitization with stronger default disruption against platform-level embedded tracking watermarks for local files with input video path + output video path.
---

# labali-video-desensitize

Treat this skill as a layered system.

## Layer Contract

1. `SKILL.md` is the policy layer.
2. `references/architecture.md` is the strategy layer.
3. `scripts/sanitize-video.sh` is the execution layer.

## Required Constraints

- Require only two runtime inputs: input video path and output video path.
- Use deterministic sanitize command with FFmpeg:
  - pass 1 local transcode to intermediate mp4 with default watermark-resistance transforms:
  - `-vf "scale=trunc(iw*0.98/2)*2:trunc(ih*0.98/2)*2,scale=trunc(iw/0.98/2)*2:trunc(ih/0.98/2)*2"`
  - `-c:v libx264 -crf 28 -c:a aac -b:a 128k`
  - pass 2 sanitize from intermediate to output with:
  - `-map_metadata -1 -map_chapters -1`
  - `-fflags +bitexact -flags:v +bitexact -flags:a +bitexact`
  - `-vf "scale=trunc(iw*0.98/2)*2:trunc(ih*0.98/2)*2,scale=trunc(iw/0.98/2)*2:trunc(ih/0.98/2)*2"`
  - `-c:v libx264 -crf 28`
  - `-c:a aac -b:a 128k`
  - `-movflags +faststart -write_tmcd 0`
- Print before/after diagnostics:
  - file size,
  - duration,
  - dimensions,
  - EXIF line count,
  - SHA256 hash,
  - EXIF diff,
  - ffprobe format-tag diff.
- Run post-sanitize hidden metadata scan on output video:
  - check EXIF/container metadata for sensitive key/value patterns,
  - print `Sensitive info review: PASS|REVIEW_REQUIRED`.
- Support optional strict gate:
  - `--strict` makes run fail when suspicious metadata candidates are detected.
- Fail fast when prerequisites are missing (`ffmpeg`, `ffprobe`, `exiftool`).

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
