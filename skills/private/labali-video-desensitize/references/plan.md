# Plan

## Stage 1: Input and Preconditions

- Read `input_video` and `output_video`.
- Ensure `ffmpeg`, `ffprobe`, and `exiftool` are installed.
- Ensure input video exists.

## Stage 2: Before Snapshot

- Print file size.
- Print duration from `ffprobe`.
- Print dimensions from `ffprobe`.
- Print EXIF line count via `exiftool | wc -l`.
- Print SHA256.

## Stage 3: Sanitize

- Run mandatory two-pass local FFmpeg flow:
  - pass 1: local transcode to intermediate mp4 (`libx264 + aac`),
  - pass 2: apply full sanitize flow from intermediate to output:
    - remove metadata/chapters,
    - enable bitexact flags,
    - re-encode video (`libx264 -crf 18`),
    - re-encode audio (`aac -b:a 128k`),
    - apply MP4 options (`-movflags +faststart -write_tmcd 0`).
  - remove intermediate file.

## Stage 4: After Snapshot

- Print the same metrics for output video.

## Stage 5: Diffs

- Print `diff <(exiftool input) <(exiftool output)` result.
- Print `diff` of ffprobe format tags.

## Stage 6: Post-Sanitize Hidden Metadata Sensitive-Info Scan

- Run `scripts/check-sensitive-video-info.sh <output>`.
- Scan output metadata for sensitive key/value patterns.
- Print final review status: `PASS` or `REVIEW_REQUIRED`.

## Stage 7: Optional Strict Gate

- If `--strict` is enabled and stage 6 finds suspicious metadata candidates, exit non-zero.
- Use this mode for CI/pipeline enforcement.
