---
name: labali-subtitle-correct-with-reference-text
description: Correct subtitle wording using a reference script that has accurate text but no timestamps. Use when the existing subtitle file already has correct timeline but wrong words, and a separate text draft is available for textual correction.
---

# labali-subtitle-correct-with-reference-text

Treat this skill as a deterministic subtitle-correction runner.

## Required Constraints

- Keep subtitle timestamps unchanged.
- Read one subtitle file (`.srt` or `.vtt`) and one reference text file.
- Correct subtitle text by sequence alignment against the reference text.
- Preserve subtitle cue count and cue timing boundaries.
- Output a corrected subtitle file.
- Do not call external subtitle APIs.

## Runtime Inputs

Use `skill.yaml` as input schema source of truth.

## Execution

Use wrapper:

```bash
npx tsx skills/private/labali-subtitle-correct-with-reference-text/scripts/run.ts \
  --subtitle_path "/path/to/input.srt" \
  --reference_path "/path/to/reference.txt" \
  [--output_path "/path/to/output.srt"]
```

Wrapper delegates to:

- `scripts/fix-subtitle-with-reference.py`

## Success Criteria

A run is successful only when all conditions hold:

1. Input subtitle and reference files both exist.
2. Subtitle file is parsed into cues.
3. Cue timestamps remain unchanged in output.
4. Subtitle text is replaced by aligned reference text segments.
5. Output subtitle file is generated.
6. Command exits with status code 0.
