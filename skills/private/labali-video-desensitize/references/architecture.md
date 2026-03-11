# Architecture

## Layered Boundaries

- Policy layer: `SKILL.md`
- Strategy layer: this file + `references/plan.md` + `references/risk-notes.md`
- Execution layer: `scripts/sanitize-video.sh`

## Execution Model

1. Validate dependencies (`ffmpeg`, `ffprobe`, `exiftool`).
2. Validate input file existence.
3. Collect before-state diagnostics.
4. Pass 1 local re-encode to intermediate mp4 with default watermark-resistance transforms (higher CRF + mild scale perturbation).
5. Pass 2 sanitize from intermediate with metadata/chapter removal, bitexact flags, repeated watermark-resistance transforms, video+audio re-encode, and MP4 container options.
6. Remove intermediate file.
7. Collect after-state diagnostics.
8. Print EXIF diff.
9. Print ffprobe format-tag diff.
10. Run post-sanitize hidden metadata sensitive-info scan.
11. Optionally enforce strict gate by non-zero exit on suspicious metadata.

## Safety Notes

- This approach reduces common metadata and tracking residue, but cannot guarantee total hidden-data elimination.
- Default stronger transforms are tuned to increase disruption pressure against platform-level embedded tracking watermarks.
- Video sanitization is less absolute than image sanitization because codec/container behavior is complex.
- For high-assurance scenarios, use stronger pipeline in `references/risk-notes.md`.
