# Max Loader icon asset provenance

The MAX mark was sourced from the [official MAX brandbook](https://go.max.ru/brandbook).
It is used here with an extension-owned loader/download badge; Max Loader is an
independent extension and is not affiliated with or endorsed by MAX.

| Field | Value |
| --- | --- |
| Source page | `https://go.max.ru/brandbook` |
| Direct archive | `https://st.max.ru/brandbook/max-colored.zip` |
| Retrieved | 2026-08-29 |
| Immutable archive | `assets/vendor/max/max-colored.zip` |
| Archive SHA-256 | `bfb540772c667ba12a2e9052295cd91dad39ebd8d270038262f2f2404303c206` |
| Archive member used | `Max colored.svg` |
| Immutable source member | `assets/vendor/max/Max colored.svg` |
| Source SHA-256 | `5caa61a4b0731d0d89421b4fb24f41433025e5aea59155a14cf3a3fada6c9174` |
| Source format | SVG; `width="100" height="100" viewBox="0 0 100 100"` |
| Archive license/readme members | None supplied (archive inspected 2026-08-29) |
| Editable derivative | `assets/source/max-loader-icon.svg` |
| Transform | Uniform 0.82 scale of the unmodified official SVG; separate lower-right badge group only |
| Pinned renderer/toolchain | Apple Quick Look `qlmanage` on macOS `26.5.2` (build `25F84`) for SVG gradients; ImageMagick `7.1.2-29 Q16-HDRI` (`b919b37fd`, 2026-07-27 build) for RGBA normalization |

The vendor archive and SVG are immutable source artifacts. Future upstream updates
must be recorded as new hashes/provenance, not overwritten silently. No open-source
license, trademark permission, or MAX endorsement is claimed here; redistribution
and release use require the appropriate legal/brand review.

Regeneration is intentionally pinned to macOS `26.5.2` (build `25F84`): run
`scripts/assets/generate-icons.sh`, then `scripts/assets/validate-icons.sh`, only
on that toolchain. Portable, read-only validation for Linux and macOS CI is:

```sh
node scripts/assets/validate-assets.mjs
```

It verifies the official archive/member hashes, archive contents, fixed generated
PNG hashes, exact PNG IHDR RGBA/alpha properties, and the absence of obvious
volatile PNG metadata chunks. It does not invoke a renderer or regenerate assets.
