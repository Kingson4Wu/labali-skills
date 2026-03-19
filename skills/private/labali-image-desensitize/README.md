# labali-image-desensitize Usage

This skill sanitizes local images by physically regenerating them with ImageMagick (resize + strip + recompress), then prints before/after diagnostics and runs a hidden-metadata sensitive-info scan with in-agent model judgment.

## 1) Install and Update

Install from GitHub:

```bash
npx skills add github.com/Kingson4Wu/labali-skills --skill labali-image-desensitize
```

Update to latest version: run the install command again.

## 2) Quick Start

```bash
npx tsx skills/private/labali-image-desensitize/scripts/run.ts \
  --input_image "/path/to/input.jpg" \
  --output_image "/path/to/output.jpg"
```

Optional flag:
- `--strict` — exit non-zero when suspicious metadata is detected in the output image.

## 3) What It Does

1. Reads `input_image`.
2. Regenerates image via ImageMagick: `-resize 99% -resize 101% -strip -quality 90`.
3. Writes sanitized result to `output_image`.
4. Prints before/after diagnostics: file size, dimensions, EXIF line count, SHA256 hash, EXIF diff.
5. Runs post-sanitize hidden metadata scan on the output image (EXIF/XMP/IPTC patterns).
6. Prints `Sensitive info review: PASS|REVIEW_REQUIRED`.
7. Agent reads `MODEL_REVIEW_JSON` payload and produces a final `PASS|REVIEW_REQUIRED|BLOCK` verdict with reasoning.

## 4) Prerequisites

- `magick` (ImageMagick 7+): `brew install imagemagick`
- `exiftool`: `brew install exiftool`
- Node.js with `tsx`

## 5) Limitations

1. **Practical-risk reduction, not forensic erasure** — physical regeneration disrupts most embedded metadata but cannot guarantee complete removal of all tracking signals.
2. **Model judgment is in-agent** — no external API call is made; the agent reads script output and applies semantic judgment inline.
3. **Input format support** — depends on ImageMagick codec support for the given file format (JPEG, PNG, WebP widely supported).

## 6) Troubleshooting

- `magick not found`: install ImageMagick 7+ and ensure it is in `PATH`.
- `exiftool not found`: install exiftool and ensure it is in `PATH`.
- Output is flagged `REVIEW_REQUIRED`: inspect the printed `MODEL_REVIEW_JSON` to see which metadata keys triggered the flag; re-run with `--strict` to gate on this condition.
