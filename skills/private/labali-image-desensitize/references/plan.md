# Plan

## Stage 1: Input and Preconditions

- Read `input_image` and `output_image`.
- Ensure `magick` and `exiftool` are installed.
- Ensure input image exists.

## Stage 2: Before Snapshot

- Print file size.
- Print dimensions from `magick identify`.
- Print EXIF line count via `exiftool | wc -l`.
- Print SHA256.

## Stage 3: Sanitize

- Run:
  - `magick input -resize 99% -resize 101% -strip -quality 90 output`

## Stage 4: After Snapshot

- Print same metrics for output image.

## Stage 5: EXIF Diff

- Print `diff <(exiftool input) <(exiftool output)` result.

## Stage 6: Post-Sanitize Hidden Metadata Sensitive-Info Scan

- Run `scripts/check-sensitive-info.sh <output>`.
- Scan output metadata for sensitive key/value patterns.
- Print final review status: `PASS` or `REVIEW_REQUIRED`.

## Stage 7: In-Agent Model Judgment (No API Key)

- Read `MODEL_REVIEW_SUMMARY` and JSON payload from stage 6 output.
- Apply rubric in `references/model-review.md`.
- Return final semantic verdict: `PASS`, `REVIEW_REQUIRED`, or `BLOCK`.

## Stage 8: Optional Strict Gate

- If `--strict` is enabled and stage 6 finds suspicious metadata candidates, exit non-zero.
- Use this mode for CI/pipeline enforcement.
