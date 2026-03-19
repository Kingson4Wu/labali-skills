# labali-whisper-transcribe-media Usage

This skill transcribes local audio or video files to text using the Whisper CLI. For video input, audio is extracted with ffmpeg first. Supports single-file and batch directory modes.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-whisper-transcribe-media
```

Update to latest version: run the install command again.

## 2) Prerequisites

- `whisper` CLI: `pip install openai-whisper`
- `ffmpeg` (required for video input): `brew install ffmpeg`

## 3) Quick Start

Single file:

```bash
npx tsx skills/private/labali-whisper-transcribe-media/scripts/run.ts \
  --input_path "/path/to/audio.mp3"
```

Batch directory:

```bash
npx tsx skills/private/labali-whisper-transcribe-media/scripts/run.ts \
  --input_path "/path/to/media/folder" \
  --parallel 2
```

Optional flags:
- `--language "Chinese"` — force Whisper language (omit to auto-detect)
- `--model "medium"` — Whisper model name (default: `medium`)
- `--task "transcribe"` — `transcribe` (default) or `translate`
- `--output_format "all"` — output format: `all`, `txt`, `srt`, `vtt`, `tsv`, `json` (default: `all`)
- `--output_text "/path/stem"` — custom output path stem
- `--parallel 2` — batch concurrency for directory mode
- `--retry 1` — retry count for failed items
- `--dry_run` — list pending files without transcribing
- `--force` — re-transcribe even if output already exists

## 4) What It Does

1. Accepts a single audio/video file or a directory.
2. For video files: extracts audio with ffmpeg before running Whisper.
3. For directories: scans recursively for media files and processes them.
4. Runs Whisper CLI with assembled parameters.
5. Outputs transcript files to `<input_stem>_subtitles/` (default), including `txt`, `srt`, `vtt`, `tsv`, and `json`.
6. In batch mode: skips items that already have a `.txt` output (unless `--force`).

## 5) Output Structure

```text
<input_stem>_subtitles/
  <input_stem>.txt
  <input_stem>.srt
  <input_stem>.vtt
  <input_stem>.tsv
  <input_stem>.json
```

## 6) Limitations

1. **Whisper accuracy** — depends on model size and audio quality; `medium` is the default balance point.
2. **Language auto-detection** — omit `--language` for auto-detection; pass it explicitly only when auto-detection is unreliable.
3. **Video extraction** — requires `ffmpeg` in `PATH`; without it, video inputs will fail.
4. **Batch concurrency** — high `--parallel` values may cause memory pressure on large models.

## 7) Troubleshooting

- `whisper: command not found`: install with `pip install openai-whisper`.
- `ffmpeg not found`: install with `brew install ffmpeg`.
- Poor transcription quality: try a larger model (e.g. `--model large`) or specify `--language` explicitly.
- To re-transcribe existing outputs: add `--force`.
