---
name: labali-whisper-transcribe-media
description: Transcribe local audio to text with Whisper and transcribe local video by first extracting audio with ffmpeg then running Whisper. Use when users need deterministic speech-to-text from media files with optional language control (for example --language Chinese) and want the agent to assemble fixed script parameters and monitor execution until completion.
---

# labali-whisper-transcribe-media

Treat this skill as a deterministic local transcription runner.

## Required Constraints

- Accept one local media input path (file or directory).
- Support both audio and video inputs.
- If input is video, extract audio with ffmpeg first.
- Run Whisper CLI for transcription.
- For directory input, scan media files recursively and process in deterministic script mode.
- Default to `--output_format all` so plain text and timeline subtitles are generated together.
- Default output directory to `<input_stem>_subtitles` under the same parent directory when `--output_text` is not provided.
- Skip media that already has `<input_stem>_subtitles/<input_stem>.txt` by default in batch mode.
- Pass `--language` only when user explicitly asks for a language.
- If language is not specified, omit `--language` and let Whisper auto-detect.
- Keep execution script-driven after parameters are fixed; do not add extra reasoning loops.
- Monitor script output and wait until command completion.

## Runtime Inputs

Use `skill.yaml` as input schema source of truth.

## Execution

Use wrapper:

```bash
npx tsx skills/private/labali-whisper-transcribe-media/scripts/run.ts \
  --input_path "/path/to/media_or_directory" \
  [--output_text "/path/to/output.txt"] \
  [--language "Chinese"] \
  [--model "medium"] \
  [--task "transcribe"] \
  [--output_format "all"] \
  [--parallel 2] \
  [--retry 1] \
  [--dry_run] \
  [--force]
```

Wrapper delegates to:

- `scripts/transcribe-media.sh`

## Dependencies

- `whisper` CLI (openai-whisper)
- `ffmpeg` (required only for video input)

## Success Criteria

A run is successful only when all conditions hold:

1. Input media file exists.
2. Audio input runs directly with Whisper.
3. Video input extracts audio and then runs Whisper.
4. For directory input, media files are discovered recursively and processed with optional concurrency.
5. Output transcript files are produced (default includes `txt`, `srt`, and `vtt`) in `<input_stem>_subtitles/`.
6. Existing results are skipped by default in batch mode unless `--force` is used.
7. Failed items are retried according to `--retry` and surfaced in summary.
8. `--dry_run` lists pending media without executing transcription.
9. Command exits with status code 0.
