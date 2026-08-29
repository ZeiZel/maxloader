# Release verification

`package.json` is the single version authority. `npm run build` copies the committed manifest into
`dist/` and materializes its version there; the committed `manifest.json` is never edited.

The local release gate is:

```text
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:dist
node scripts/assets/validate-assets.mjs
npm run e2e:smoke
npm run package
npm run verify:reproducible
```

The e2e gate uses headed Chromium with an isolated temporary profile so MV3 extensions can load:
locally set `PW_HEADLESS=0` (and optionally `CHROME_BIN` for an installed Chrome); CI runs the same
command under `xvfb-run` after installing the pinned Playwright Chromium. The fixture is synthetic
and contains no MAX login or private content.

Packaging includes only the three bundles, stylesheet, generated manifest and four icon exports.
Entries are sorted explicitly, have normalized timestamps/modes, and are written as
`maxloader-<package-version>.zip` with a neighboring SHA-256 file. Set `SOURCE_DATE_EPOCH` to a
stable integer no earlier than `315532800` (`1980-01-01T00:00:00Z`) for reproducible output; CI
uses that ZIP-compatible epoch. Packaging fails fast for older values and validates that ZIP
entries contain no timestamp extra fields.

The workflows do not contain Chrome Web Store credentials or publishing steps. The manual/tag
workflow can create a draft GitHub Release with the verified package only.
