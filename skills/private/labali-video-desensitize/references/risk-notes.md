# Risk Notes

## Known Gaps

- No single FFmpeg command guarantees 100% hidden-information removal across all codecs/containers.
- Re-encode + metadata stripping is practical and usually effective, but not forensic-grade.
- Container internals may still keep non-obvious technical traces in edge cases.
- Platform-level robust watermarking can survive high-quality re-encodes; stronger transforms improve odds but remain non-guaranteed.

## Why This Skill Uses Audio Re-Encode

- Avoid `-c:a copy` because copied audio can carry untouched hidden payloads.
- Force `-c:a aac -b:a 128k` to reduce this risk.

## Mandatory Two-Pass Local Transcode

- This skill always uses two local passes plus default stronger disruption transforms (`crf 28` and mild scale perturbation) to approximate a third-party upload/download rewrite effect without network dependency.
- Pass 1 writes an intermediate mp4; pass 2 applies full metadata-stripping sanitize flow.
- This improves practical robustness, but still does not prove 100% hidden-data elimination.

## High-Assurance Alternative

Use when security requirements are very high:

1. Extract frames.
2. Sanitize each frame as image.
3. Rebuild video with newly encoded audio.
4. Run forensic verification tools (for example MAT2 and dedicated media forensics workflows).

## Communication Rule

Always state: this skill provides practical desensitization, not absolute proof of complete hidden-data eradication.
