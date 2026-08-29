# 02 — Testing and verification

## Verified current facts

- The repository uses Vitest with jsdom and has four suites: controller, DOM, bridge/background and
  queue/media/voice.
- Tests already cover basic idempotence, strict queue interval, direct media parsing, selection marker,
  lazy rendering, bridge fallback and basic filename sanitization.
- Current tests do not cover runtime sender validation, exact host/path policy, forged in-page events,
  recycled DOM identity, lazy-only action visibility or preservation of unrelated audio.
- Some expected queue failures call the real console logger. A canonical run should not require humans
  to distinguish expected warning noise from regressions.
- A clean checkout requires `npm ci` before verification. The inspected worktree had no dependencies,
  so local `npm test`/`npm run typecheck` startup failed for that reason.

## Decisions

### T-01. Deterministic test seams

All time, DOM discovery, download calls, capture events, playback state and logging cross explicit
ports. Unit tests inject fakes; fake timers are used only where timing itself is under test. There are
no production test flags.

### T-02. Test layers

1. **Pure unit tests** — policy parsers, filename normalization, view-state calculation, queue state
   transitions, version/artifact manifest calculation.
2. **Adapter contract tests** — MAX DOM fixtures, Chrome sender/runtime/download adapter, MAIN hook,
   playback ownership, deterministic asset/package helpers.
3. **Component integration tests in jsdom** — isolated content root with fake Chrome/time and DOM
   mutations/rerenders.
4. **Built-extension smoke** — load `dist/` in a pinned Chromium using a local fixture page; verify
   manifest/scripts/action flow with no access to private MAX content.
5. **Manual live smoke** — separately run against a dedicated/sanitized `web.max.ru` test chat because
   the site DOM and CDN are not public contracts.

No automated CI logs, snapshots or artifacts contain real chat HTML, URLs with signed query strings,
filenames, account IDs, cookies or screenshots of private conversations.

### T-03. Quiet expected failures

- Application code uses an injected structured logger.
- Tests inject a no-op logger by default.
- A test expecting a warning injects a recorder and asserts the redacted reason code exactly.
- Any unexpected `console.warn`/`console.error`, unhandled rejection, open timer or leaked listener fails
  the suite.
- Tool warnings caused by repository npm configuration are reported separately from product tests and
  must not be hidden by redirecting stderr.

### T-04. Stable fixtures

DOM fixtures are small, synthetic and named by observed date/shape. Each MAX-specific selector has:

- supported fixture(s);
- near-miss fixture(s), including link previews/posters/unselected messages;
- rerender/virtualization fixture(s);
- an explicit comment identifying observed evidence rather than calling it a guaranteed MAX API.

## Required automated matrix

### Architecture and DI

- Each use case runs with fakes and without `window`, `document` or `chrome` globals.
- Each root wires exactly one lifecycle and disposes it idempotently.
- Static guard forbids `svelte-[A-Za-z0-9_-]+` in source, styles and production fixtures.

### Reconciliation and performance

- A mutation burst schedules one reconciliation.
- Own subtree mutations schedule none.
- Repeated equivalent reconciliation produces zero DOM writes.
- Panel replacement/navigation removes stale controls/listeners.
- A benchmark-style fixture with many irrelevant mutations asserts bounded discovery calls, not a
  fragile wall-clock duration.

### Selection and virtualization

- Only a genuine selected marker contributes candidates.
- Recycled `data-index` cannot transfer identity to another message.
- Node replacement between discovery and action triggers re-resolution, not an old click.
- Ambiguous/missing locators fail closed.
- Album duplicates are removed within a run while separate valid attachments remain.
- A selected off-screen message with only a lazy media tile still exposes the action in pending-count
  state and is discovered after scrolling/render wait.
- Total/progress never decreases and final total is announced only after discovery ends.

### Media and voice

- Document, photo, video, album, link-preview near miss and video-poster near miss remain covered.
- URL host/path policy is tested independently from DOM parsing.
- Successful voice resolution pauses/restores only the changed shared player.
- Timeout, replaced player and ambiguous multiple-audio cases leave unrelated audio untouched.
- Both initially paused and initially playing states are covered.
- The listened-state disclosure is checked in user-facing documentation; it is not falsely asserted as
  preventable in code.

### Event and message security

- Capture is ignored while disarmed, after timeout, for the wrong sequence/run and when no document
  click is awaiting capture.
- A page-forged `CustomEvent` cannot create a download outside the bounded expected session.
- Missing sender, wrong extension ID, no tab, subframe, non-HTTPS tab, wrong origin and malformed URL
  sender contexts are rejected.
- Request rejects arbitrary HTTP, userinfo, custom port, malformed/encoded hostname, sibling/subdomain
  lookalikes, wrong paths and unsupported kinds.
- Each currently allowed exact host/path family has positive and near-miss negative cases.
- Filename rejects/control-normalizes separators, traversal, dot-only, controls, forbidden characters,
  empty and overlong values; Unicode truncation is code-point/byte safe.
- No rejected request reaches the fake downloads port or leaks request values to logs.
- Fallback accepts only an already validated request and cannot recurse through the hook.

### Package/version/assets

- Manifest schema and least permissions are asserted from built output.
- Package version, built manifest version, archive filename and tag version come from the same value.
- Archive content is an exact allowlist; `manifest.json` is at ZIP root.
- Paths are sorted and metadata normalized.
- Two clean builds with the same source/lockfile/toolchain epoch have equal SHA-256.
- Icon exports have exact dimensions, RGBA/transparent capability and deterministic hashes from their
  recorded source inputs.

## Manual live smoke matrix

Use only a dedicated chat with non-sensitive fixtures and record Chrome/MAX version plus date, not
account or signed URLs.

1. Load unpacked `dist/`; confirm no manifest/service-worker errors.
2. Verify no action outside `https://web.max.ru/*`.
3. Select no attachment, one of each supported type, a mixed set, an album and messages spanning
   virtualized screens.
4. Confirm exact/pending label behavior, one action only, progress, cancellation-by-navigation and
   recovery after an item failure.
5. Keep unrelated audio playing, download a voice and confirm unrelated audio state is preserved;
   confirm the voice may be marked listened.
6. Exercise document capture and `chrome.downloads` fallback behavior without broadening permissions.
7. Confirm filenames, duplicate handling and that no link preview/video poster is saved.
8. Inspect service-worker logs for redaction and browser download list for only intended items.

Screenshots, if needed for evidence, must use synthetic/sanitized content and remain outside the
release ZIP unless explicitly approved as Store material.

## Canonical verification

The implementation phase must define scripts so CI and local verification call the same commands:

```text
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:dist
npm run package
npm run verify:reproducible
```

If format/lint tooling is intentionally not added, the corresponding gate may be omitted only by a
documented decision; typecheck, tests, build, dist validation and reproducibility are mandatory.

## Assumptions, risks and non-goals

- Pinned Chromium smoke infrastructure is assumed feasible in GitHub Actions; a live MAX login is not.
- jsdom does not fully model browser worlds, downloads or media. Contract tests and a real-browser
  smoke complement it rather than pretending equivalence.
- Coverage percentage is not an acceptance proxy. Critical rejection paths and state transitions are
  mandatory even if a numeric threshold passes.
- CI will not store MAX credentials or automate a personal account.

## Testing acceptance criteria

- The full canonical command is green after `npm ci` and produces no unexpected warnings/errors.
- All cases in the required automated matrix exist and critical policy tests prove no call reached the
  download adapter.
- Built-extension smoke passes on the pinned Chromium version.
- A manual live smoke record identifies tested versions/date and contains no private data.
- Test failures are reproducible locally with the documented toolchain.

## Migration plan

1. Make existing tests quiet with injected logger/fake time; do not weaken assertions.
2. Add characterization and missing security tests against current boundaries.
3. Refactor through ports one boundary at a time while keeping those tests green.
4. Add virtualization/lazy/audio fixtures before changing the respective production behavior.
5. Add built-output, version, asset and reproducibility checks.
6. Run live smoke only after automated gates and inspect any failure before release work continues.
