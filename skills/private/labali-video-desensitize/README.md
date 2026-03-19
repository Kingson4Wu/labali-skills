# labali-video-desensitize Usage

This skill sanitizes local video files using a mandatory two-pass FFmpeg re-encode with watermark-resistance transforms, metadata stripping, and a post-sanitize hidden-metadata scan.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-video-desensitize
```

Update to latest version: run the install command again.

## 2) Quick Start

```bash
npx tsx skills/private/labali-video-desensitize/scripts/run.ts \
  --input_video "/path/to/input.mp4" \
  --output_video "/path/to/output.mp4"
```

Optional flag:
- `--strict` — exit non-zero when suspicious metadata is detected in the output video.

## 3) What It Does

**Pass 1** — transcode to intermediate MP4 with watermark-resistance transforms:
- Mild scale perturbation: scale to 98% then back to original dimensions
- Re-encode: `libx264 CRF 28`, AAC 128k audio

**Pass 2** — sanitize intermediate to output with:
- Metadata/chapter stripping: `-map_metadata -1 -map_chapters -1`
- Bitexact flags to reduce encoding fingerprints
- Container hardening: `-movflags +faststart -write_tmcd 0`

After both passes:
- Prints before/after diagnostics: file size, duration, dimensions, EXIF count, SHA256 hash, EXIF diff, ffprobe format-tag diff.
- Runs post-sanitize hidden metadata scan.
- Prints `Sensitive info review: PASS|REVIEW_REQUIRED`.
- Removes intermediate file automatically.

## 4) Prerequisites

- `ffmpeg` + `ffprobe`: `brew install ffmpeg`
- `exiftool`: `brew install exiftool`
- Node.js with `tsx`

## 5) Limitations

1. **Practical-risk reduction, not forensic erasure** — two-pass re-encode with scale perturbation improves disruption odds against platform-level embedded watermarks but cannot guarantee full removal.
2. **Quality trade-off** — CRF 28 and mild scale perturbation reduce visual quality slightly; for high-fidelity archives, adjust via source edits.
3. **Container support** — output is always MP4; input formats supported by FFmpeg are accepted.

## 6) Troubleshooting

- `ffmpeg not found`: install FFmpeg and ensure it is in `PATH`.
- `exiftool not found`: install exiftool and ensure it is in `PATH`.
- Output flagged `REVIEW_REQUIRED`: inspect the printed metadata diff to see which keys triggered the flag.
- Intermediate file left behind: this only happens on crash mid-pass; delete it manually and re-run.
