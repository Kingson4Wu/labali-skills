# Workflow Plan

## Stage 1: Local Extraction Flow

### Step 1 — Dependency check
- Verify macOS runtime.
- Verify `ffmpeg` is in `PATH`.
- Verify `pyobjc-framework-Vision` is importable.

### Step 2 — Frame extraction
- Run ffmpeg with `select` and `showinfo` filters.
- Adaptive mode (`smart`): use scene-change detection (`select=gt(scene\,<threshold>)`) with dynamic max-gap fallback.
- Capture `pts_time` for each extracted frame from `showinfo` stderr output.
- Save frames to `frames/` under output directory.
- If frame count is below threshold after scene detection, retry with relaxed gap.

### Step 3 — Vision OCR
- For each frame image, run `Vision.VNRecognizeTextRequest` via pyobjc.
- Use configured languages (default: `zh-Hans,zh-Hant,en`) and recognition level (default: `accurate`).
- Collect recognized text in reading order.
- Store raw result as `FrameOCR(index, image_path, pts_time, text)`.

### Step 4 — Raw timeline
- Write all OCR results to `raw_frames.jsonl` (debug mode).
- Sort by `pts_time`.

### Step 5 — Near-duplicate merge
- Compare consecutive OCR rows by text similarity (`difflib.SequenceMatcher`).
- If similarity ≥ `merge_similarity` AND time gap ≤ `merge_max_gap`: merge into a single `MergedOCR(start_pts, end_pts, text)`.
- Write merged result to `merged_timeline.txt` and `merged_frames.jsonl` (debug mode).

### Step 6 — Chunk generation
- Split `merged_timeline.txt` into overlapping chunks of `chunk_size` rows with `chunk_overlap` overlap.
- Write each chunk to `chunks/chunk_XXX_input.txt`.
- Write `chunk_manifest.json` recording chunk index, row range, and time span.
- Write `llm_merge_prompt_template.md` with the merge instruction template.

### Step 7 — Cleanup
- Non-debug (default): remove intermediate files (`raw_frames.jsonl`, `raw_timeline.txt`, `merged_frames.jsonl`, `chunks/`, `frames/`), keep `merged_timeline.txt` and `final_transcript.md`.
- Debug (`--debug`): keep all intermediate artifacts.
- If `--cleanup_frames`: remove `frames/` even in debug mode.

---

## Stage 2: LLM Merge Flow

Executed by the current AI assistant after Stage 1 completes.

### Step 1 — Read chunk files
- List `chunks/chunk_XXX_input.txt` in order from `chunk_manifest.json`.

### Step 2 — Merge each chunk
- Feed each chunk to the assistant with the `llm_merge_prompt_template.md` instruction.
- Assistant deduplicates near-identical rows and groups them into time-anchored paragraphs.
- Output: time range + merged text block per chunk.

### Step 3 — Concatenate
- Combine chunk outputs in order.
- Resolve boundary overlaps from chunk_overlap rows.
- Write to `final_transcript.md`.

---

## Tuning Guidance

| Scenario | Recommendation |
|----------|----------------|
| Presentation slides / low motion | Use `--adaptive_mode fixed --fps 0.5` |
| Fast-cut video / many scene changes | Lower `--scene 0.2` |
| Many duplicate OCR rows in timeline | Raise `--merge_similarity 0.95` or lower `--merge_max_gap 1.0` |
| Very long video | Increase `--chunk_size 120` to reduce chunk count |
| Debugging extraction issues | Add `--debug` to inspect raw frames and timeline |
