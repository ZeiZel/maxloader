#!/usr/bin/env bash
# Deterministic MAX Loader icon export.
# Pinned toolchain: macOS 26.5.2 (25F84) qlmanage + ImageMagick 7.1.2-29.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source_svg="$repo_root/assets/source/max-loader-icon.svg"
generated_dir="$repo_root/assets/generated"
icons_dir="$repo_root/public/icons"

mkdir -p "$generated_dir" "$icons_dir"

if ! command -v qlmanage >/dev/null 2>&1 || ! command -v magick >/dev/null 2>&1; then
  echo "Apple Quick Look (qlmanage) and ImageMagick (magick) are required." >&2
  exit 1
fi

required_macos='26.5.2'
if [[ "$(sw_vers -productVersion)" != "$required_macos" ]]; then
  echo "Expected macOS $required_macos for the pinned Quick Look SVG renderer." >&2
  exit 1
fi

renderer_version=$(magick -version | sed -n '1p')
required_renderer='Version: ImageMagick 7.1.2-29 Q16-HDRI'
if [[ "$renderer_version" != "$required_renderer"* ]]; then
  echo "Expected $required_renderer; found: $renderer_version" >&2
  exit 1
fi

render_png() {
  local size=$1 output=$2
  local temporary center edge
  temporary=$(mktemp -d)
  # Quick Look preserves the official SVG's gradients where ImageMagick's SVG
  # delegate does not. It emits an opaque white preview, so exact white is made
  # transparent (including anti-aliased near-white edge pixels) and the
  # source-defined badge clear-space backing is restored.
  qlmanage -t -s "$size" -o "$temporary" "$source_svg" >/dev/null 2>&1
  center=$(awk -v value="$size" 'BEGIN { printf "%.4f", value * 0.80 }')
  edge=$(awk -v value="$size" 'BEGIN { printf "%.4f", value * 0.97 }')
  magick "${temporary}/$(basename "$source_svg").png" -fuzz 15% -transparent white \
    "${temporary}/keyed.png"
  magick -size "${size}x${size}" xc:none -fill '#FFFFFF' \
    -draw "circle ${center},${center} ${edge},${center}" \
    "${temporary}/keyed.png" -compose over -composite -colorspace sRGB -alpha on -depth 8 -strip \
    -define png:color-type=6 -define png:bit-depth=8 \
    -define png:exclude-chunks=date,time -define png:compression-level=9 \
    "PNG32:$output"
  rm -rf "$temporary"
}

# Fixed order is intentional: extension sizes, followed by the 1024px QA master.
render_png 16 "$icons_dir/icon-16.png"
render_png 32 "$icons_dir/icon-32.png"
render_png 48 "$icons_dir/icon-48.png"
render_png 128 "$icons_dir/icon-128.png"
render_png 1024 "$generated_dir/max-loader-master-1024.png"
