#!/usr/bin/env bash
set -euo pipefail

INPUT_IMAGE="${1:-}"
OUTPUT_IMAGE="${2:-}"
CHECK_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-sensitive-info.sh"
STRICT_MODE="false"

for arg in "${@:3}"; do
  if [[ "$arg" == "--strict" ]]; then
    STRICT_MODE="true"
  fi
done

if [[ -z "$INPUT_IMAGE" || -z "$OUTPUT_IMAGE" ]]; then
  echo "Usage: sanitize-image.sh <input_image> <output_image>" >&2
  exit 1
fi

if [[ ! -f "$INPUT_IMAGE" ]]; then
  echo "Input image not found: $INPUT_IMAGE" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "Missing dependency: magick (ImageMagick)" >&2
  exit 1
fi

if ! command -v exiftool >/dev/null 2>&1; then
  echo "Missing dependency: exiftool" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  HASH_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  HASH_CMD="shasum -a 256"
else
  echo "Missing dependency: sha256sum or shasum" >&2
  exit 1
fi

output_dir="$(dirname "$OUTPUT_IMAGE")"
mkdir -p "$output_dir"

hash_of() {
  local file="$1"
  # shellcheck disable=SC2086
  $HASH_CMD "$file" | awk '{print $1}'
}

echo "===== Before Processing ====="
echo "File size: $(ls -lh "$INPUT_IMAGE" | awk '{print $5}')"
echo "Dimensions: $(magick identify -format "%wx%h" "$INPUT_IMAGE")"
echo "EXIF line count: $(exiftool "$INPUT_IMAGE" | wc -l | awk '{print $1}')"
echo "SHA256: $(hash_of "$INPUT_IMAGE")"

magick "$INPUT_IMAGE" -resize 99% -resize 101% -strip -quality 90 "$OUTPUT_IMAGE"

echo ""
echo "===== After Processing ====="
echo "File size: $(ls -lh "$OUTPUT_IMAGE" | awk '{print $5}')"
echo "Dimensions: $(magick identify -format "%wx%h" "$OUTPUT_IMAGE")"
echo "EXIF line count: $(exiftool "$OUTPUT_IMAGE" | wc -l | awk '{print $1}')"
echo "SHA256: $(hash_of "$OUTPUT_IMAGE")"

echo ""
echo "===== EXIF Diff ====="
diff <(exiftool "$INPUT_IMAGE") <(exiftool "$OUTPUT_IMAGE") || true

echo ""
check_args=("$OUTPUT_IMAGE")
if [[ "$STRICT_MODE" == "true" ]]; then
  check_args+=("--strict")
fi
"$CHECK_SCRIPT" "${check_args[@]}"
