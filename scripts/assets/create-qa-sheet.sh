#!/usr/bin/env bash
# Produces visual-QA panes for every manifest size on light and dark surfaces.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
qa_dir="$repo_root/assets/qa"
master="$repo_root/assets/generated/max-loader-master-1024.png"
icon_16="$repo_root/public/icons/icon-16.png"
icon_32="$repo_root/public/icons/icon-32.png"
icon_48="$repo_root/public/icons/icon-48.png"
icon_128="$repo_root/public/icons/icon-128.png"
mkdir -p "$qa_dir"

preview() {
  local source=$1 background=$2 output=$3 resize=$4
  magick "$source" -background "$background" -alpha remove -alpha off \
    -filter point -resize "$resize" -strip \
    -define png:color-type=2 -define png:bit-depth=8 \
    -define png:exclude-chunks=date,time -define png:compression-level=9 "$output"
}

preview "$master" '#FFFFFF' "$qa_dir/master-on-light.png" 320x320
preview "$master" '#0D001A' "$qa_dir/master-on-dark.png" 320x320
# Nearest-neighbour enlargement exposes the actual native 16px pixels for review.
preview "$icon_16" '#FFFFFF' "$qa_dir/icon-16-on-light.png" 320x320
preview "$icon_16" '#0D001A' "$qa_dir/icon-16-on-dark.png" 320x320
preview "$icon_32" '#FFFFFF' "$qa_dir/icon-32-on-light.png" 320x320
preview "$icon_32" '#0D001A' "$qa_dir/icon-32-on-dark.png" 320x320
preview "$icon_48" '#FFFFFF' "$qa_dir/icon-48-on-light.png" 320x320
preview "$icon_48" '#0D001A' "$qa_dir/icon-48-on-dark.png" 320x320
preview "$icon_128" '#FFFFFF' "$qa_dir/icon-128-on-light.png" 320x320
preview "$icon_128" '#0D001A' "$qa_dir/icon-128-on-dark.png" 320x320

magick \( "$qa_dir/master-on-light.png" "$qa_dir/icon-16-on-light.png" \
  "$qa_dir/icon-32-on-light.png" "$qa_dir/icon-48-on-light.png" \
  "$qa_dir/icon-128-on-light.png" +append \) \
  \( "$qa_dir/master-on-dark.png" "$qa_dir/icon-16-on-dark.png" \
  "$qa_dir/icon-32-on-dark.png" "$qa_dir/icon-48-on-dark.png" \
  "$qa_dir/icon-128-on-dark.png" +append \) -append -strip \
  -define png:color-type=2 -define png:bit-depth=8 \
  -define png:exclude-chunks=date,time -define png:compression-level=9 \
  "$qa_dir/icon-qa-contact-sheet.png"
