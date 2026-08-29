# Max Loader: architecture release specification

Status: approved implementation baseline  
Prepared: 2026-08-29  
Target: Chrome Manifest V3 extension for `https://web.max.ru/*`

This package defines the architecture and release hardening requested after the first working
implementation. It supersedes `tasks/max-loader/chrome-extension/README.md` for future architecture,
security, assets, testing and release work. The older file remains historical evidence; conflicts are
resolved by this package.

## Package index

1. [Architecture](01-architecture.md) — boundaries, manual dependency injection, ports/adapters,
   three composition roots, DOM/media and security behavior.
2. [Testing](02-testing.md) — test pyramid, deterministic seams, security and regression matrix,
   canonical verification.
3. [Assets](03-assets.md) — official MAX source, attribution, extension badge, deterministic exports.
4. [CI and release](04-ci-release.md) — GitHub Actions as IaC, version authority, reproducible ZIP and
   release gates.
5. [GitHub and Store handoff](05-github-store-handoff.md) — personal GitHub push and the strictly
   limited Chrome Web Store registration-form handoff.

## Verified current facts

Facts below were verified from the repository on 2026-08-29 unless a different date is stated.

- The project is TypeScript, built by `tsup` as three MV3 IIFE bundles: isolated-world content
  script, MAIN-world page hook and background service worker.
- `manifest.json` grants `downloads`, matches only `https://web.max.ru/*`, and registers the three
  runtime entry points.
- Documents are captured from page-created anchors; photos, videos and voices are passed as direct
  URLs to the service worker. The DOM shapes and CDN hosts in the root README were live-checked on
  2026-08-27, but they are observations, not a MAX API contract.
- The original specification says not to use `chrome.downloads`, covers mostly document buttons,
  treats `.messageWrapper--selection` as selection identity and includes Store publication. Those
  statements conflict with the working implementation and the current user boundary.
- `src/dom.ts` hardcodes `svelte-1pwsock` in the extension button classes.
- `src/background.ts` accepts any HTTP(S) URL with the expected channel/type. Its message listener
  ignores `sender`; the request guard does not validate filename, allowed host/path, top frame or
  originating tab URL.
- `src/download-bridge.ts` accepts a same-document `CustomEvent`. Any page script able to execute in
  that document can dispatch such an event, so the event is an untrusted input even when nested
  cross-origin iframes cannot reach the parent document.
- Queue identity uses `data-index`, attachment ordinals and retained element objects. MAX virtualizes
  and rerenders message DOM; indices and nodes cannot be assumed durable across a whole run.
- The initial button count comes from currently rendered attachments. A selected, off-screen message
  whose only media tile is still lazy can therefore exist while the button is absent or its count is
  low.
- Voice resolution calls `pause()` and resets `currentTime` on every `<audio>` element, not only on
  playback started by Max Loader.
- Vitest/jsdom tests cover controller lifecycle, common DOM cases, queue ordering, media parsing,
  voice resolution and part of the bridge/background behavior. Failure paths can emit console noise,
  and sender/host/path/filename forgery, virtualization and unrelated-audio preservation are not
  covered.
- Version `0.1.0` is repeated independently in `package.json`, `manifest.json` and
  `scripts/package.mjs`. The packaging script shells out to `zip -r` without normalizing entry order,
  timestamps or permissions, so byte-for-byte reproducibility is not guaranteed.
- Current icons are four 1-bit colormap PNGs at 16/32/48/128 px. The repository contains no source,
  provenance or attribution record proving they are official MAX artwork.
- `npm test` and `npm run typecheck` could not be executed in this clean worktree because dependencies
  were not installed (`node_modules` absent). This is an environment precondition, not evidence of a
  product defect; CI must use `npm ci` first.
- The official MAX brandbook is `https://go.max.ru/brandbook`; the official colored mark archive is
  `https://st.max.ru/brandbook/max-colored.zip`. Supplied brand guidance requires preserved
  proportions/readability and identifies palette colors `#471AFF`, `#9500FF`, `#FFFFFF`, `#00BFFF`,
  `#6E1AFF`, `#0D001A`.

## User requirements

| ID | Requirement |
| --- | --- |
| UR-01 | Optimize the extension without changing its intended batch-download behavior. |
| UR-02 | Establish a maintainable architecture with explicit manual DI, clear test seams and IaC/CI. |
| UR-03 | Use the official MAX icon source and add a small, visually separate loader badge. |
| UR-04 | Push the verified result to the user's personal GitHub. |
| UR-05 | Only after the push, open the Chrome Web Store developer registration form. Do not pay, submit registration, upload an item, send for review or publish. |

## Decisions

- **D-01 — ports/adapters with manual DI.** Framework-free factories receive narrow interfaces;
  browser globals are confined to adapters and exactly three composition roots.
- **D-02 — three deployable roots remain.** The isolated content script owns UI/orchestration, the
  MAIN hook observes page anchor clicks, and the service worker is the only owner of
  `chrome.downloads`.
- **D-03 — every boundary is untrusted.** DOM, `CustomEvent`, runtime messages, URLs and filenames are
  parsed and constrained. Correlation reduces exposure but is not described as authentication.
- **D-04 — runtime identity is short-lived.** Every action is re-resolved and revalidated against the
  current selected DOM; virtualized nodes and `data-index` are not durable domain IDs.
- **D-05 — no hashed site classes.** The extension owns its classes and styles. It may observe stable
  semantic DOM signals but never copy `svelte-*` hashes.
- **D-06 — one version authority and reproducible artifact.** The release version is derived once and
  validated everywhere; the same source revision and inputs produce an identical ZIP hash.
- **D-07 — GitHub Actions is the infrastructure.** CI/release workflow files are versioned IaC. There
  is no Terraform, server, cloud account or long-lived release service.
- **D-08 — the icon is a disclosed derivative.** The MAX mark is sourced from the official brandbook;
  the loader badge identifies this extension, not MAX, and must not imply endorsement.
- **D-09 — external handoff stops at the registration form.** Chrome Web Store payment and all
  submission/publication actions remain with the user.

Detailed decisions and acceptance conditions are normative in the numbered files.

## Assumptions and open decisions

- The intended GitHub repository name is assumed to be `maxloader`; visibility is unresolved and must
  be confirmed before creating or changing a remote.
- The personal GitHub account must be confirmed from the authenticated CLI/browser context before
  push. Authentication alone is not proof that the account is the intended target.
- Russian MAX UI is the only verified locale. Additional locales are not promised by this release.
- Exact CDN host/path rules must be confirmed from fresh real samples before implementation locks an
  allowlist. The initial observed families are `fd.oneme.ru`, `i.oneme.ru`, `a.oneme.ru` and
  `maxvd*.okcdn.ru`.
- The official archive's embedded license/readme, if any, must be reviewed without inventing rights.
  Source attribution does not by itself grant redistribution permission.
- A 440x280 promotional image is generated only if the Store form or later separately authorized
  listing work requires it. Opening registration does not require creating or uploading it.

## Risks

- MAX exposes no stable extension API; DOM, localization, CDN and playback behavior can change.
- Same-document page events cannot provide a secret, authenticated channel between MAIN and isolated
  worlds. Strict gating/correlation and service-worker validation limit impact but do not make the
  page trusted.
- Voice URL discovery can mark a voice as listened and can disturb existing playback unless state is
  precisely scoped and restored.
- Direct CDN rules can be too broad (security issue) or too narrow (downloads fail). Fixtures must
  cover each accepted and rejected family.
- Branding misuse can imply official affiliation. Keep the badge visually distinct, record
  provenance and include a non-affiliation statement where appropriate.
- GitHub push and browser navigation are external actions. A wrong account, repository visibility or
  extra Store click would exceed the request.

## Non-goals

- No backend, proxy, database, telemetry, remote configuration or server-side infrastructure.
- No DI framework, service locator, global mutable dependency registry or Terraform.
- No bypass of MAX authentication, Chrome security prompts, CDN authorization or rate limits.
- No downloading message text, decrypting files, merging attachments into an archive or supporting
  other sites/browsers in this release.
- No redesign of the official MAX mark and no claim that Max Loader is an official MAX product.
- No Chrome Web Store developer fee, registration submission, item creation/upload, review request or
  publication.

## Release-wide acceptance criteria

- **AC-01:** no shipped source/style/fixture depends on a literal `svelte-*` build hash.
- **AC-02:** the three composition roots are the only places that instantiate concrete adapters;
  core/use-case modules do not read browser globals directly.
- **AC-03:** forged events/messages, invalid sender contexts, disallowed URLs and unsafe filenames are
  rejected without invoking `chrome.downloads` or logging private values.
- **AC-04:** virtualization, rerender and lazy-only selection cases do not download an unselected or
  duplicated attachment and do not hide the action solely because media has not rendered yet.
- **AC-05:** a voice attempt never pauses/resets unrelated audio; documented unavoidable listened-state
  behavior remains visible to users.
- **AC-06:** canonical clean verification is quiet and green after `npm ci`; two artifact builds from
  the same revision have the same SHA-256.
- **AC-07:** official source/provenance is recorded and deterministic transparent exports exist at
  16/32/48/128 px; any 440x280 promo is a separate optional deliverable.
- **AC-08:** the verified repository is pushed to the confirmed personal GitHub target with no secrets
  or private chat material.
- **AC-09:** after AC-08, the browser may be left showing the Chrome Web Store developer registration
  form; no payment, submission, item upload or publication occurs.

## Migration plan

1. Freeze current behavior with clean characterization tests and security rejection tests.
2. Introduce domain types, ports and manual factories while keeping all three current entry bundles.
3. Move browser/global access into adapters; centralize URL, sender and filename validation.
4. Replace hashed styling and durable-node assumptions; add rerender/lazy discovery semantics.
5. Scope voice playback state and restore only the element Max Loader changed.
6. Replace ad-hoc asset and ZIP generation with deterministic pipelines and one version authority.
7. Add required GitHub Actions checks, build twice, inspect the archive and run unpacked/live smoke.
8. Perform the confirmed personal GitHub push.
9. Only then open the Store developer registration form and stop.

Each step must leave the extension testable; no big-bang rewrite is required.
