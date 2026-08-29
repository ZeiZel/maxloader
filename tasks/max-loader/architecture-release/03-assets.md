# 03 — Brand assets and extension icon

## Verified sources and constraints

- Official MAX brandbook: `https://go.max.ru/brandbook`.
- Official colored mark archive: `https://st.max.ru/brandbook/max-colored.zip`.
- Supplied brand guidance requires preserving the mark's proportions and readability.
- Supplied palette: `#471AFF`, `#9500FF`, `#FFFFFF`, `#00BFFF`, `#6E1AFF`, `#0D001A`.
- Existing repository PNGs have the required 16/32/48/128 dimensions but are 1-bit colormap files
  with no source/provenance record; they are not accepted as proof of official branding.

## User requirements

- Download the official MAX icon from an official source.
- Add a small loader/download badge.
- Produce Chrome extension sizes deterministically.
- Preserve source/attribution/licensing evidence.

## Asset decisions

### AS-01. Provenance and licensing record

The implementation stores an asset manifest containing:

- source page URL and direct archive URL;
- retrieval date;
- SHA-256 of the unmodified downloaded archive;
- exact archive member used;
- its SHA-256 and format/dimensions/viewBox;
- verbatim file names of any license/readme delivered in the archive;
- a short attribution: “MAX mark sourced from the official MAX brandbook” with the source URL;
- the transformation tool and pinned version.

Do not claim an open-source license, trademark permission or MAX endorsement unless the official
material explicitly states it. If the archive/brandbook terms are unclear about redistribution in an
extension icon, this is a release/legal review item; provenance is not a substitute for permission.

The downloaded vendor original is immutable. Future source updates create a new hash/provenance entry,
not an unrecorded overwrite.

### AS-02. Source, edit target and exports

Recommended structure:

```text
assets/
  vendor/max/                 # immutable official source member + provenance/license files
  source/max-loader-icon.svg  # editable derivative, transparent canvas
  generated/
    max-loader-master-1024.png
    promo-440x280.png         # optional, only when separately required
public/icons/
  icon-16.png
  icon-32.png
  icon-48.png
  icon-128.png
scripts/assets/               # deterministic generation and validation
```

`assets/source/max-loader-icon.svg` is the edit target. It keeps the official colored mark unchanged
in geometry/color and adds the extension-owned badge as a separate named group. A transparent
1024x1024 RGBA PNG is the raster master/QA reference. Manifest exports are always regenerated from
the source, never resized from a 16px or previously compressed PNG.

### AS-03. Loader badge treatment

- Use a simple extension-owned download cue (for example, downward arrow into a short tray) in the
  lower-right safe area.
- Badge occupies only enough area to remain recognizable at 16px; target roughly 28–34% of the canvas
  and confirm optically at every export size.
- Separate the badge from the MAX mark with its own circular/rounded backing and clear space. Do not
  splice the arrow into the MAX glyph or present it as an official logo variant.
- Badge colors come from the documented palette and retain contrast on light/dark Chrome surfaces.
- Do not stretch, rotate, recolor, crop or redraw the official mark. Preserve proportions and
  readability.
- The provenance/listing note identifies the badge as Max Loader extension artwork, not part of MAX's
  official mark. Where appropriate: “Max Loader is an independent extension and is not affiliated with
  or endorsed by MAX.”

### AS-04. Deterministic generation

- Pin the renderer and its version in the lockfile/container/toolchain documentation.
- Use explicit canvas, color profile, alpha, interpolation and output parameters.
- Strip volatile PNG metadata; do not embed local paths, timestamps or author-machine data.
- Generate sizes in fixed order: 16, 32, 48, 128, then master; validate exact square dimensions and
  RGBA/alpha support.
- Record output SHA-256 values in generated validation output or CI artifact metadata. Do not make
  hashes a hand-maintained source of truth if generation can calculate them.

### AS-05. Optional 440x280 promotion image

The 440x280 image is not a manifest icon. Generate it only if a later Store listing step actually
requires it. It must be a separately composed canvas with the extension name/badge, safe margins,
brand provenance and no private MAX UI/chat screenshot. It is validated at exactly 440x280 and never
silently stretched from the square icon.

## Assumptions and open decisions

- The direct archive contains a suitable colored mark asset. The exact member/format remains unknown
  until the authorized implementation downloads and inspects it.
- A badge design variant must be selected by visual QA at 16px. If none remains legible without
  violating brand clear space, use a simplified high-contrast badge, not a distorted MAX mark.
- Store asset requirements can change; verify them at the time separately authorized Store listing
  work begins. Opening developer registration alone does not authorize listing assets/upload.

## Risks

- Brand terms may not explicitly authorize this derivative/distribution.
- Downsampling can erase the badge or blur the official mark.
- A badge merged into the mark can misrepresent it as official.
- Non-pinned image tooling or embedded metadata breaks reproducibility.

## Non-goals

- No new MAX logo, wordmark or palette invention.
- No claim of partnership or official status.
- No Store screenshot capture or upload under this release handoff.
- No manual editing of individual 16/32/48/128 exports.

## Asset acceptance criteria

- Provenance identifies both official URLs, retrieval date, input/member hashes and transformation
  tool; supplied license/readme files are retained or referenced without invented terms.
- Editable transparent source and 1024px transparent raster master exist.
- Official mark proportions/colors are preserved and badge is visibly separate as extension artwork.
- Deterministic PNGs exist at exactly 16/32/48/128; each is visually inspected at 100% scale on light
  and dark backgrounds and passes automated dimension/alpha checks.
- Re-running generation from identical inputs produces identical hashes.
- Manifest references only generated files.
- Optional promo, if requested later, is exactly 440x280, separately composed and contains no private
  content.

## Asset migration plan

1. Download the official archive from the recorded URL and hash it before extraction.
2. Inspect archive member names and included terms; select the correct colored mark without alteration.
3. Create provenance and the transparent editable derivative with a separate badge group.
4. Generate master and icon variants using the pinned deterministic script.
5. Run automated validation and side-by-side visual QA at native sizes/light-dark backgrounds.
6. Replace current placeholder/unprovenanced icons only after all checks pass.
7. Generate a 440x280 promo only under later, explicit Store-listing scope.
