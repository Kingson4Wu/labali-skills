#!/usr/bin/env bash
set -euo pipefail

TARGET_IMAGE="${1:-}"
STRICT_MODE="false"

for arg in "${@:2}"; do
  if [[ "$arg" == "--strict" ]]; then
    STRICT_MODE="true"
  fi
done

if [[ -z "$TARGET_IMAGE" ]]; then
  echo "Usage: check-sensitive-info.sh <target_image>" >&2
  exit 1
fi

if [[ ! -f "$TARGET_IMAGE" ]]; then
  echo "Target image not found: $TARGET_IMAGE" >&2
  exit 1
fi

if ! command -v exiftool >/dev/null 2>&1; then
  echo "Missing dependency: exiftool" >&2
  exit 1
fi

SENSITIVE_META_KEY_PATTERN='GPS|Latitude|Longitude|Address|Location|Owner|Author|Creator|Artist|By-line|Copyright|Rights|Serial|IMEI|Identifier|UserComment|Comment|XPAuthor|XPComment|MakerNote'
SENSITIVE_META_VALUE_PATTERN='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(\+?[0-9][0-9 ()-]{7,}[0-9])'

meta_dump="$(exiftool -a -u -g1 "$TARGET_IMAGE" 2>/dev/null || true)"
key_hits="$(printf '%s\n' "$meta_dump" | grep -E -i "$SENSITIVE_META_KEY_PATTERN" | sort -u || true)"
value_hits="$(printf '%s\n' "$meta_dump" | grep -E -i "$SENSITIVE_META_VALUE_PATTERN" | sort -u || true)"
meta_json="$(exiftool -json -a -u -g1 "$TARGET_IMAGE" 2>/dev/null || true)"

has_key_hits="false"
has_value_hits="false"
key_hits_count=0
value_hits_count=0
if [[ -n "$key_hits" ]]; then
  has_key_hits="true"
  key_hits_count="$(printf '%s\n' "$key_hits" | wc -l | awk '{print $1}')"
fi
if [[ -n "$value_hits" ]]; then
  has_value_hits="true"
  value_hits_count="$(printf '%s\n' "$value_hits" | wc -l | awk '{print $1}')"
fi

echo "===== Post-Sanitize Sensitive Info Scan ====="
echo "Target image: $TARGET_IMAGE"
echo "Scan scope: hidden metadata only (EXIF/XMP/IPTC/etc.)"
echo "Strict mode: $STRICT_MODE"

echo ""
echo "[Sensitive Metadata Key Candidates]"
if [[ "$has_key_hits" == "true" ]]; then
  printf '%s\n' "$key_hits"
else
  echo "No suspicious metadata keys found."
fi

echo ""
echo "[Sensitive Metadata Value Candidates]"
if [[ "$has_value_hits" == "true" ]]; then
  printf '%s\n' "$value_hits"
else
  echo "No suspicious metadata values found."
fi

echo ""
if [[ "$has_key_hits" == "true" || "$has_value_hits" == "true" ]]; then
  echo "Sensitive info review: REVIEW_REQUIRED"
else
  echo "Sensitive info review: PASS"
fi

echo ""
echo "===== Model Review Payload ====="
echo "Use this payload for semantic risk judgment without OCR."
echo "MODEL_REVIEW_SUMMARY key_hits_count=$key_hits_count value_hits_count=$value_hits_count"
echo "MODEL_REVIEW_JSON_BEGIN"
printf '%s\n' "$meta_json"
echo "MODEL_REVIEW_JSON_END"

if [[ "$STRICT_MODE" == "true" && ("$has_key_hits" == "true" || "$has_value_hits" == "true") ]]; then
  echo "Strict mode gate: FAIL (suspicious hidden metadata detected)" >&2
  exit 2
fi
