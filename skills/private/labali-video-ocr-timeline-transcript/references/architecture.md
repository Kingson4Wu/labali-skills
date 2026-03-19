# Architecture

## Layer Contract

| Layer | File | Purpose |
|-------|------|---------|
| Policy | `SKILL.md` | Goals, constraints, success criteria. Stable. |
| Strategy | `references/architecture.md` | Execution model, failure handling, quality standards. |
| Execution | `scripts/*.py`, `scripts/run.ts` | Concrete implementation. Replaceable. |

Keep policy stable, strategy explicit, and execution replaceable.

## Pipeline Stages

This skill runs a two-stage pipeline:

**Stage 1 — Local deterministic extraction (scripts/video-ocr-timeline.py)**

1. Extract keyframes and capture `pts_time` timestamps using ffmpeg `showinfo` filter.
2. Run Vision.framework OCR on each extracted frame image.
3. Merge near-duplicate OCR rows by text similarity and time-gap thresholds.
4. Generate `merged_timeline.txt` (time-indexed text rows).
5. Split into overlapped chunk files under `chunks/` for LLM processing.

**Stage 2 — LLM semantic merge (handled by current AI assistant)**

1. Read each `chunks/chunk_XXX_input.txt`.
2. Apply `llm_merge_prompt_template.md` to semantically deduplicate and group rows into time ranges.
3. Concatenate chunk outputs into `final_transcript.md`.

Stage 1 is fully local and deterministic. Stage 2 is delegated to the active AI assistant (Codex/Gemini); no hardcoded SDK or provider is used.

## Frame Extraction Modes

| Mode | Description |
|------|-------------|
| `smart` (default) | Scene-change driven with dynamic max-gap fallback and auto-retry on sparse results |
| `hybrid` | Scene-change selection combined with fixed-fps cap |
| `fixed` | Fixed fps sampling only |

Use `smart` mode for general video. Switch to `fixed` for presentation slides or low-motion content.

## OCR Strategy

- Use Vision.framework via pyobjc (`pyobjc-framework-Vision`).
- Recognize all frames; do not apply rule-based deduplication before merge.
- Merge pass uses similarity threshold (`merge_similarity`) and time-gap (`merge_max_gap`) to consolidate near-identical consecutive rows.
- Timestamps come from `pts_time` only — never interpolated from frame index.

## Chunk Design

- Chunks overlap by `chunk_overlap` rows to avoid boundary splits.
- `chunk_manifest.json` records each chunk's row range and time span.
- Chunk size and overlap are tunable via `skill.yaml` inputs.

## Failure Handling

- Fail fast if `ffmpeg` or `pyobjc-framework-Vision` is missing.
- Fail fast if input video does not exist or is unreadable.
- On sparse extraction result (few frames after scene detection): adaptive mode retries with relaxed max-gap before failing.
- Re-runs overwrite the output folder by deleting existing contents first.

## Output Quality Standards

- All timestamps must come from `pts_time` parsed from ffmpeg output, not from frame count or interpolation.
- `merged_timeline.txt` must contain at least one entry for a successful run.
- `final_transcript.md` is produced by LLM merge and is not validated by the script itself.
- Debug mode (`--debug`) preserves all intermediate artifacts for inspection.
