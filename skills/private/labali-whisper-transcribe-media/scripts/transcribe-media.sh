#!/usr/bin/env bash
set -euo pipefail

INPUT_PATH=""
OUTPUT_PATH=""
LANGUAGE=""
MODEL="medium"
TASK="transcribe"
OUTPUT_FORMAT="all"

print_usage() {
  cat <<USAGE
Usage: transcribe-media.sh --input <media_path> [--output <text_path>] [--language <lang>] [--model <name>] [--task transcribe|translate] [--output-format txt|srt|vtt|tsv|json|all]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      INPUT_PATH="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
      shift 2
      ;;
    --language)
      LANGUAGE="${2:-}"
      shift 2
      ;;
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --task)
      TASK="${2:-}"
      shift 2
      ;;
    --output-format)
      OUTPUT_FORMAT="${2:-}"
      shift 2
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_usage
      exit 1
      ;;
  esac
done

if [[ -z "$INPUT_PATH" ]]; then
  echo "Missing required --input" >&2
  print_usage
  exit 1
fi

if [[ ! -f "$INPUT_PATH" ]]; then
  echo "Input file not found: $INPUT_PATH" >&2
  exit 1
fi

if [[ "$TASK" != "transcribe" && "$TASK" != "translate" ]]; then
  echo "Invalid --task value: $TASK (use transcribe|translate)" >&2
  exit 1
fi

case "$OUTPUT_FORMAT" in
  txt|srt|vtt|tsv|json|all) ;;
  *)
    echo "Invalid --output-format value: $OUTPUT_FORMAT (use txt|srt|vtt|tsv|json|all)" >&2
    exit 1
    ;;
esac

if ! command -v whisper >/dev/null 2>&1; then
  echo "Missing dependency: whisper CLI. Install with: pip install -U openai-whisper" >&2
  exit 1
fi

input_abs="$(cd "$(dirname "$INPUT_PATH")" && pwd)/$(basename "$INPUT_PATH")"
input_name="$(basename "$input_abs")"
input_stem="${input_name%.*}"
input_ext="${input_name##*.}"
input_ext_lc="$(printf '%s' "$input_ext" | tr '[:upper:]' '[:lower:]')"

is_video="false"
case "$input_ext_lc" in
  mp4|mov|m4v|avi|mkv|webm|flv|wmv)
    is_video="true"
    ;;
esac

audio_source="$input_abs"
tmp_audio=""

if [[ "$is_video" == "true" ]]; then
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "Missing dependency: ffmpeg (required for video input)." >&2
    exit 1
  fi

  tmp_base="$(mktemp -t "${input_stem}.XXXXXX")"
  rm -f "$tmp_base"
  tmp_audio="${tmp_base}.wav"
  echo "[1/2] Extract audio from video..."
  ffmpeg -y -i "$input_abs" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$tmp_audio" >/dev/null 2>&1
  audio_source="$tmp_audio"
fi

out_dir="$(dirname "$input_abs")"
if [[ -n "$OUTPUT_PATH" ]]; then
  output_dir_raw="$(dirname "$OUTPUT_PATH")"
  output_base_raw="$(basename "$OUTPUT_PATH")"
  output_stem="${output_base_raw%.*}"
  if [[ "$output_stem" == "$output_base_raw" ]]; then
    output_stem="$output_base_raw"
  fi
  mkdir -p "$output_dir_raw"
  output_dir_abs="$(cd "$output_dir_raw" && pwd)"
else
  output_stem="$input_stem"
  output_dir_abs="$out_dir/${input_stem}_subtitles"
  mkdir -p "$output_dir_abs"
fi

whisper_stem="$(basename "$audio_source")"
whisper_stem="${whisper_stem%.*}"

cmd=(
  whisper "$audio_source"
  --model "$MODEL"
  --task "$TASK"
  --output_format "$OUTPUT_FORMAT"
  --output_dir "$out_dir"
  --fp16 False
)

if [[ -n "$LANGUAGE" ]]; then
  cmd+=(--language "$LANGUAGE")
fi

echo "[2/2] Run Whisper transcription..."
"${cmd[@]}"

formats=()
if [[ "$OUTPUT_FORMAT" == "all" ]]; then
  formats=(txt srt vtt tsv json)
else
  formats=("$OUTPUT_FORMAT")
fi

produced=0
for fmt in "${formats[@]}"; do
  generated_path="$out_dir/$whisper_stem.$fmt"
  if [[ ! -f "$generated_path" ]]; then
    continue
  fi
  target_path="$output_dir_abs/$output_stem.$fmt"
  mv -f "$generated_path" "$target_path"
  echo "Done: $target_path"
  produced=$((produced + 1))
done

if [[ "$produced" -eq 0 ]]; then
  echo "Whisper output not found for expected formats: ${formats[*]}" >&2
  [[ -n "$tmp_audio" ]] && rm -f "$tmp_audio"
  exit 1
fi

if [[ -n "$tmp_audio" ]]; then
  rm -f "$tmp_audio"
fi
