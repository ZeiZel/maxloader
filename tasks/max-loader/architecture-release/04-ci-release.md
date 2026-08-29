# 04 — CI, packaging and release

## Verified current facts

- `package-lock.json` exists and npm scripts provide build, typecheck, test and package.
- `tsup.config.ts` bundles three IIFEs and copies manifest, CSS and `public/` to `dist`.
- Version `0.1.0` is duplicated in package metadata, manifest and the literal ZIP filename.
- `scripts/package.mjs` reads `dist`, then invokes platform `zip -r`; it does not enforce an exact file
  allowlist or normalize order, timestamps, mode bits and archive metadata.
- No GitHub Actions workflow is present in the inspected source set.

## Decisions

### CI-01. GitHub Actions is release IaC

Version-controlled workflows and action configuration are the only infrastructure required. Do not
introduce Terraform, a server, hosted database, release daemon or cloud credentials.

Workflows use least privilege:

- default `permissions: contents: read`;
- no `pull_request_target` execution of untrusted code;
- action references pinned to immutable commit SHAs (with readable version comments) for
  security-sensitive release workflows;
- concurrency cancels stale CI on the same branch but does not cancel an active tagged release;
- no Chrome Web Store credentials or publishing step.

### CI-02. CI workflow

Triggers: pull request and pushes to the protected default/release branches. Use a pinned supported
Node major and `npm ci`; cache key includes OS, Node version and `package-lock.json` hash.

Required gates call repository scripts described in `02-testing.md`:

1. formatting/lint policy;
2. TypeScript typecheck;
3. quiet unit/contract/integration tests;
4. production build;
5. manifest and exact `dist` content validation;
6. icon/provenance validation;
7. package generation and reproducibility check;
8. archive SHA-256 and concise build summary.

Upload only the final ZIP, checksum and sanitized test reports. Set explicit short retention; do not
upload `dist` source maps, live DOM, signed URLs or browser profiles.

### CI-03. Single version authority

`package.json.version` is the repository authority for normal development. A deterministic build step
materializes/validates the same Chrome-compatible `major.minor.patch[.build]` value in the output
manifest and derives `maxloader-<version>.zip`.

For a tagged release, tag `vX.Y.Z` must equal `package.json.version`; mismatch fails before building.
No script silently edits committed files in CI. Lockfile root version must agree when npm records it.

### CI-04. Exact and reproducible ZIP

The packaging implementation must:

- start from a clean freshly generated `dist`;
- include an explicit sorted allowlist of extension runtime files and icon paths;
- place `manifest.json` at archive root;
- exclude source maps, tests, sources, task specs, `.git`, `node_modules`, OS metadata and the archive
  itself;
- normalize timestamps from `SOURCE_DATE_EPOCH` (release commit time or a documented fixed epoch),
  Unix mode bits, path separators, owner/group metadata and compression settings;
- avoid platform-dependent recursive directory discovery;
- write the archive outside `dist` and calculate SHA-256;
- fail on missing required or unexpected extra runtime files.

`verify:reproducible` builds/packages twice in isolated temporary directories from identical inputs and
compares hashes. It must not reuse the first build output.

### CI-05. Release workflow

A GitHub Release is optional and distinct from “push to personal GitHub.” If enabled, it triggers only
on a matching `vX.Y.Z` tag or explicit workflow dispatch with confirmed version. It reruns all gates,
attaches the already verified ZIP/checksum and may create a draft GitHub Release. It never uploads to
Chrome Web Store.

Creating tags/releases is not implicitly authorized by the user's push request; the implementation
must obtain that scope or limit itself to branch push and CI artifact.

### CI-06. Supply-chain and secret hygiene

- `npm ci` is mandatory; lockfile changes are reviewed.
- No install step runs through ad-hoc `curl | sh`.
- Repository history/staged files and built ZIP are scanned for obvious secrets/private chat artifacts
  before push.
- Workflow logs never print environment dumps, auth configuration or full signed download URLs.
- Dependabot/Renovate is optional; automated dependency updates must still pass the same gates.

## Assumptions and risks

- The GitHub plan supports Actions for the selected repository visibility.
- Node/OS pinning reduces but does not eliminate toolchain drift; renderer/archiver versions must also
  be pinned or implemented in a deterministic library.
- Git commit timestamps vary by revision; reproducibility is defined for the same revision and declared
  inputs, not across different commits.
- A passing CI artifact is not a Store approval guarantee.

## Non-goals

- No automatic Chrome Web Store upload/publish.
- No automatic semantic-release/version bump unless separately approved.
- No signing service, artifact server or permanent runner.
- No GitHub release/tag creation merely because a branch is pushed.

## CI/release acceptance criteria

- CI workflow files are reviewed IaC with least permissions and immutable action pins.
- A clean checkout completes `npm ci` and all mandatory gates.
- One authoritative version matches package, lockfile as applicable, built manifest, tag (when any) and
  ZIP filename.
- Archive contains the exact runtime allowlist with manifest at root and no private/development files.
- Two isolated packages of the same revision have identical SHA-256.
- CI artifacts/logs contain no secrets, live user data or signed URLs.
- No workflow has Chrome Web Store credentials or a Store mutation step.

## CI/release migration plan

1. Add non-mutating validators for version, manifest and `dist` contents.
2. Replace literal ZIP naming and recursive platform ZIP behavior with deterministic packaging.
3. Add local reproducibility verification.
4. Add CI with read-only permissions and required gates.
5. Verify CI on the feature branch, inspect the ZIP/checksum manually and load it unpacked.
6. Add a separately gated release workflow only if GitHub Release creation is explicitly wanted.
