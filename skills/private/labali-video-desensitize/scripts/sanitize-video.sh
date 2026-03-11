#!/usr/bin/env bash
set -euo pipefail

INPUT_VIDEO="${1:-}"
OUTPUT_VIDEO="${2:-}"
CHECK_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/check-sensitive-video-info.sh"
STRICT_MODE="false"
VIDEO_CRF="28"
ANTI_WATERMARK_VF='scale=trunc(iw*0.98/2)*2:trunc(ih*0.98/2)*2,scale=trunc(iw/0.98/2)*2:trunc(ih/0.98/2)*2'

for arg in "${@:3}"; do
  if [[ "$arg" == "--strict" ]]; then
    STRICT_MODE="true"
  fi
done

if [[ -z "$INPUT_VIDEO" || -z "$OUTPUT_VIDEO" ]]; then
  echo "Usage: sanitize-video.sh <input_video> <output_video> [--strict]" >&2
  exit 1
fi

if [[ ! -f "$INPUT_VIDEO" ]]; then
  echo "Input video not found: $INPUT_VIDEO" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Missing dependency: ffmpeg" >&2
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "Missing dependency: ffprobe" >&2
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

output_dir="$(dirname "$OUTPUT_VIDEO")"
mkdir -p "$output_dir"

hash_of() {
  local file="$1"
  # shellcheck disable=SC2086
  $HASH_CMD "$file" | awk '{print $1}'
}

duration_of() {
  local file="$1"
  ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$file" | head -n 1
}

dimensions_of() {
  local file="$1"
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$file" | head -n 1
}

format_tags_of() {
  local file="$1"
  ffprobe -v error -show_entries format_tags -of default=nw=1 "$file"
}

print_snapshot() {
  local title="$1"
  local file="$2"
  echo "===== $title ====="
  echo "File size: $(ls -lh "$file" | awk '{print $5}')"
  echo "Duration(s): $(duration_of "$file")"
  echo "Dimensions: $(dimensions_of "$file")"
  echo "EXIF line count: $(exiftool "$file" | wc -l | awk '{print $1}')"
  echo "SHA256: $(hash_of "$file")"
}

print_snapshot "Before Processing" "$INPUT_VIDEO"
echo "Sanitize mode: watermark-resistance default enabled"
echo "Video CRF: $VIDEO_CRF"
echo "Video filter: $ANTI_WATERMARK_VF"

intermediate_file="${OUTPUT_VIDEO}.intermediate-pass.mp4"
trap 'rm -f "$intermediate_file"' EXIT

ffmpeg -y -i "$INPUT_VIDEO" \
  -vf "$ANTI_WATERMARK_VF" \
  -c:v libx264 -crf "$VIDEO_CRF" \
  -c:a aac -b:a 128k \
  "$intermediate_file"

ffmpeg -y -i "$intermediate_file" \
  -map_metadata -1 \
  -map_chapters -1 \
  -fflags +bitexact \
  -flags:v +bitexact \
  -flags:a +bitexact \
  -vf "$ANTI_WATERMARK_VF" \
  -c:v libx264 -crf "$VIDEO_CRF" \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  -write_tmcd 0 \
  "$OUTPUT_VIDEO"

echo ""
print_snapshot "After Processing" "$OUTPUT_VIDEO"

echo ""
echo "===== EXIF Diff ====="
diff <(exiftool "$INPUT_VIDEO") <(exiftool "$OUTPUT_VIDEO") || true

echo ""
echo "===== ffprobe Format Tag Diff ====="
diff <(format_tags_of "$INPUT_VIDEO") <(format_tags_of "$OUTPUT_VIDEO") || true

echo ""
check_args=("$OUTPUT_VIDEO")
if [[ "$STRICT_MODE" == "true" ]]; then
  check_args+=("--strict")
fi
"$CHECK_SCRIPT" "${check_args[@]}"
