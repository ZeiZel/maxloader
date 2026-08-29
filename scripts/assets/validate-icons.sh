#!/usr/bin/env bash
# Validates PNG geometry, explicit RGBA, alpha support and repeatable output hashes.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
generated_dir="$repo_root/assets/generated"
icons_dir="$repo_root/public/icons"
files=(
  "16:$icons_dir/icon-16.png"
  "32:$icons_dir/icon-32.png"
  "48:$icons_dir/icon-48.png"
  "128:$icons_dir/icon-128.png"
  "1024:$generated_dir/max-loader-master-1024.png"
)

for entry in "${files[@]}"; do
  expected_size=${entry%%:*}
  file=${entry#*:}
  read -r width height channels < <(magick identify -format '%w %h %[channels]\n' "$file")
  if [[ "$width" != "$expected_size" || "$height" != "$expected_size" || "$channels" != srgba* ]]; then
    echo "Invalid PNG: $file (${width}x${height}, channels=${channels}; expected ${expected_size}x${expected_size} srgba)" >&2
    exit 1
  fi
done

before=$(shasum -a 256 "${files[@]#*:}")
"$repo_root/scripts/assets/generate-icons.sh"
after=$(shasum -a 256 "${files[@]#*:}")
if [[ "$before" != "$after" ]]; then
  echo "Icon generation is not deterministic." >&2
  diff -u <(printf '%s\n' "$before") <(printf '%s\n' "$after") >&2 || true
  exit 1
fi

printf '%s\n' "$after"
