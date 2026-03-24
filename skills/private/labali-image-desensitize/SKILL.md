---
name: labali-image-desensitize
description: Sanitize and desensitize local images by physically regenerating them with ImageMagick re-encode flow (resize 99% -> 101%, strip metadata, recompress), then print before/after size, dimensions, EXIF count, SHA256, EXIF diff, and a post-sanitize hidden-metadata sensitive-info scan. Use when you want to strip, clean, or verify hidden metadata (EXIF, GPS, tracking info) from local images, with before/after diagnostics and a post-sanitize scan. Input: image path + output path.
license: MIT
compatibility: macOS / Linux; requires ImageMagick (convert) and exiftool in PATH.
allowed-tools: "Bash(convert:*), Bash(exiftool:*), Bash(bash:*)"
metadata:
  pattern: pipeline
  sub-pattern: reviewer
---

# labali-image-desensitize

Treat this skill as a layered system.

## Layer Contract

1. `SKILL.md` is the policy layer.
2. `references/architecture.md` is the strategy layer.
3. `scripts/sanitize-image.sh` is the execution layer.

## NEVER

- Never overwrite the input file — always write to a separate output path.
- Never report PASS on the sensitive-info scan without completing Step 4.
- Never skip Step 3 diagnostics — before/after comparison is required output regardless of result.

## Pipeline Steps

Execute in fixed order:

> If the intent or design rationale of any pipeline step is unclear, load `references/plan.md` before proceeding.

**Step 1 — Validate prerequisites**
- Confirm `magick` and `exiftool` are available in PATH.
- Fail fast with explicit error if either is missing.
- Confirm input image path is readable.

**Step 2 — ImageMagick re-encode**
- Run `scripts/sanitize-image.sh` with input and output paths.
- Apply `-resize 99% -resize 101% -strip -quality 90`.
- Require only two runtime inputs: input image path and output image path.

**Step 3 — Diagnostics**
- Print before/after comparison:
  - file size,
  - dimensions,
  - EXIF line count,
  - SHA256 hash,
  - EXIF diff.

**Step 4 — Reviewer: sensitive metadata scan**
- Run post-sanitize hidden metadata scan on output image via `scripts/check-sensitive-info.sh`.
- Check EXIF/XMP/IPTC metadata for sensitive key/value patterns.
- Load `references/model-review.md` for review rubric.
- Print `Sensitive info review: PASS|REVIEW_REQUIRED`.
- Print `MODEL_REVIEW_SUMMARY` + `MODEL_REVIEW_JSON` payload.
- Apply in-agent model judgment (no API key required):
  - read payload from script output,
  - decide `PASS|REVIEW_REQUIRED|BLOCK`,
  - report verdict with reason and evidence.

**Step 5 — Return result**
- In normal mode: report verdict and summary.
- In `--strict` mode: exit non-zero when sensitive metadata candidates are detected.

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
