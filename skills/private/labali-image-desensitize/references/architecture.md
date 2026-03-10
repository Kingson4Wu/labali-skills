# Architecture

## Layered Boundaries

- Policy layer: `SKILL.md`
- Strategy layer: this file + `references/plan.md`
- Execution layer: `scripts/sanitize-image.sh`

## Execution Model

1. Validate dependencies (`magick`, `exiftool`).
2. Validate input file existence.
3. Collect before-state metrics.
4. Regenerate image using deterministic transform:
   - `magick <input> -resize 99% -resize 101% -strip -quality 90 <output>`
5. Collect after-state metrics.
6. Print EXIF diff.
7. Run post-sanitize hidden metadata sensitive-info scan.
8. Hand off metadata payload to in-agent model judgment rubric.
9. Optionally enforce strict gate by non-zero exit on suspicious metadata.

## Safety Notes

- This approach targets metadata and common hidden payload vectors by full re-encode.
- Content is preserved visually but binary fingerprint changes by design.
- Sensitive-info scan is metadata-only by design (no OCR/content semantics).
- Semantic final decision is made in-agent from script payload; no external API is required.
