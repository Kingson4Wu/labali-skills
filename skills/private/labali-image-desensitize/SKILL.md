---
name: labali-image-desensitize
description: Sanitize and desensitize local images by physically regenerating them with ImageMagick re-encode flow (resize 99% -> 101%, strip metadata, recompress), then print before/after size, dimensions, EXIF count, SHA256, EXIF diff, and a post-sanitize hidden-metadata sensitive-info scan. Use when users want to reduce and verify hidden metadata/tracking info in downloaded images with input image path + output path only. Include deterministic scan plus in-agent model semantic judgment from metadata payload (no OCR required).
---

# labali-image-desensitize

Treat this skill as a layered system.

## Layer Contract

1. `SKILL.md` is the policy layer.
2. `references/architecture.md` is the strategy layer.
3. `scripts/sanitize-image.sh` is the execution layer.

## Required Constraints

- Require only two runtime inputs: input image path and output image path.
- Use physical regeneration method via ImageMagick:
  - `-resize 99% -resize 101% -strip -quality 90`
- Print before/after diagnostics:
  - file size,
  - dimensions,
  - EXIF line count,
  - SHA256 hash,
  - EXIF diff.
- Run post-sanitize hidden metadata scan on output image:
  - check EXIF/XMP/IPTC metadata for sensitive key/value patterns,
  - print `Sensitive info review: PASS|REVIEW_REQUIRED`,
  - print `MODEL_REVIEW_SUMMARY` + `MODEL_REVIEW_JSON` payload for model judgment.
- Support optional strict gate:
  - `--strict` makes run fail when sensitive metadata candidates are detected.
- Perform in-agent model judgment (do not require API key):
  - read payload from script output,
  - decide `PASS|REVIEW_REQUIRED|BLOCK`,
  - report verdict with reason and evidence.
- Fail fast when prerequisites are missing (`magick`, `exiftool`).

## Success Criteria

A run is successful only when all conditions hold:

1. Input image is readable.
2. Output image is generated at target path.
3. Before/after diagnostics are printed.
4. EXIF diff section is printed (empty diff is acceptable).
5. Post-sanitize sensitive metadata scan section is printed.
6. Model review verdict section is printed.
7. In strict mode, suspicious hidden metadata produces non-zero exit.

## Runtime Inputs

Use `skill.yaml` as input schema source of truth.

## Operational Mode

- Deterministic local shell execution only.
- No browser, no network, no API.
- Keep output reproducible and script-driven.

## Resources

- Architecture: `references/architecture.md`
- Workflow plan: `references/plan.md`
- Model review rubric: `references/model-review.md`
- Deterministic script: `scripts/sanitize-image.sh`
- Post-check script: `scripts/check-sensitive-info.sh`
- Optional CLI wrapper: `scripts/run.ts`
- Regression checks: `tests/test_regression.sh`
