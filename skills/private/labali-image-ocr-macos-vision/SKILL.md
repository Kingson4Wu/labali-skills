---
name: labali-image-ocr-macos-vision
description: Run native macOS image OCR through Vision.framework via pyobjc bridge (same engine family used by Preview/Live Text), with Chinese+English recognition defaults and deterministic CLI execution. Use when users need high-quality OCR text extraction from local images on macOS and want output to stdout or a text file.
license: MIT
compatibility: macOS only (10.15 Catalina or later); requires Python 3 with pyobjc-framework-Vision installed; Vision.framework provided by macOS.
metadata:
  pattern: pipeline
---

# labali-image-ocr-macos-vision

Treat this skill as a deterministic local OCR executor.

## Required Constraints

- Run on macOS only.
- Use Apple `Vision.framework` through `pyobjc` bridge.
- Use recognition language defaults:
  - `zh-Hans`,
  - `zh-Hant`,
  - `en`.
- Default recognition level to `accurate`.
- Require local file path input for image OCR.
- Return recognized text in reading order and preserve line breaks.
- Support optional output text file path.

## Setup

Install dependencies before first run:

```bash
pip install pyobjc-framework-Vision pyobjc-framework-Quartz
```

## Runtime Inputs

Use `skill.yaml` as input schema source of truth.

## Execution

Use wrapper:

```bash
npx tsx skills/private/labali-image-ocr-macos-vision/scripts/run.ts \
  --image_path "/path/to/image.jpg" \
  [--output_text "/path/to/result.txt"] \
  [--languages "zh-Hans,zh-Hant,en"] \
  [--recognition_level accurate]
```

The wrapper delegates to:

- `scripts/ocr-image-macos.py`

## Success Criteria

A run is successful only when all conditions hold:

1. Script validates runtime is macOS.
2. Input image exists and is readable.
3. Vision request completes without API error.
4. OCR text is printed to stdout.
5. If `output_text` is provided, text file is written.
