# 05 — Personal GitHub and Chrome Web Store handoff

## Scope boundary

This procedure interprets the user's sequence literally:

1. verify and push the completed repository to the user's confirmed personal GitHub;
2. only after successful push, open the Chrome Web Store developer registration form;
3. stop without paying, submitting registration, creating/uploading an item, requesting review or
   publishing.

Opening a page is authorized by the requirement. Clicking a registration/payment/submit/publish
control is not.

## Verified current facts

- The repository is being prepared on branch `feat/architecture-release` in an isolated linked
  worktree.
- The requested destination is “personal GitHub,” but repository name, owner and visibility were not
  specified in the requirement supplied to this specification task.
- Chrome Web Store registration may require login, agreements and a fee. Those external conditions do
  not expand authorization.

## Decisions

### GH-01. Confirm the exact remote before mutation

Before creating a repository or changing/pushing a remote, resolve and show for confirmation when not
already unambiguous:

- authenticated GitHub account login and whether it is the intended personal account;
- repository owner/name (default proposal: `<personal-login>/maxloader`);
- visibility;
- target branch/default branch and whether the remote already exists;
- whether only branch push or also PR creation is desired.

Authentication tokens and credential files are never printed or copied. An existing unrelated remote
is not overwritten. If the target exists, inspect it read-only first and stop on non-fast-forward or
ownership ambiguity.

### GH-02. Pre-push gate

Push only a reviewed commit set that passes:

- clean canonical verification and live/unpacked smoke required by `02-testing.md`;
- deterministic artifact and checksum checks from `04-ci-release.md`;
- asset provenance/visual QA from `03-assets.md`;
- diff/status review confirming no unrelated user changes are included;
- history/staged/archive scan for secrets, credentials, private chat text/screenshots, signed download
  URLs, browser profiles, `node_modules`, transient `dist` or other forbidden artifacts;
- README/privacy/store metadata consistency with actual permissions and behavior.

Do not force-push. Do not rewrite history or change visibility as a convenience. A branch push does not
automatically authorize PR, tag, release or branch-protection changes.

### GH-03. Push evidence

Success requires:

- Git reports the expected remote ref updated;
- a read-only remote check resolves the pushed commit SHA on the confirmed owner/repository/branch;
- the repository URL and pushed branch/SHA are recorded for the user without exposing credentials;
- CI status is reported. If required checks fail, the GitHub phase is not called release-ready even
  though network push succeeded.

### ST-01. Registration-form-only browser action

After GH-03 succeeds, navigate the user's existing authenticated browser context to the official Chrome
Web Store developer registration entry page. Verify the origin is an official Google/Chrome Web Store
domain before interaction.

Allowed:

- open/navigate to the official registration form;
- leave the form visible for the user;
- report whether it requests login, agreement or payment without entering sensitive data.

Forbidden in this task:

- accept terms or submit registration;
- enter/confirm billing details or pay the developer fee;
- create a developer account/profile;
- create a Store item, upload ZIP/images, fill listing/privacy/distribution fields;
- request review, publish, unpublish or change an existing item.

If the account is already registered and navigation lands on the Developer Dashboard instead of a
registration form, stop on that dashboard. Do not open “New item” or upload anything. If Google shows
a payment screen, leave it untouched.

### ST-02. No Store automation in CI

No Web Store API key/OAuth secret is added to GitHub, local files or workflows. Store publication is a
future separately authorized process, not a release pipeline stage.

## Assumptions and open decisions

- The user has or can select the intended personal GitHub account and repository visibility.
- Existing authenticated browser state may be used to open the official form, but credentials are not
  requested, stored or inspected by the project.
- The exact Google registration URL and UI may change; it must be verified at execution time rather
  than hardcoded as a permanent product fact.
- PR creation, GitHub Release creation and public visibility are unresolved unless separately stated.

## Risks

- Pushing to a work/organization account or accidentally public repository can disclose unfinished
  code/assets.
- A repository with existing unrelated history can make an otherwise safe push destructive.
- Browser sessions may be logged into the wrong Google account.
- Registration UI can place payment/submission controls next to navigation; one extra click exceeds
  authorization.
- Store policies and fees are temporally unstable and must be checked at handoff time, not assumed here.

## Non-goals

- No force push, repository transfer, visibility change, tag or GitHub Release without explicit scope.
- No Chrome Web Store registration completion, payment, item upload, review or publication.
- No automation of personal login, MFA, billing or agreement acceptance.
- No promise of Store approval or listing availability.

## Acceptance criteria

- The exact personal GitHub owner/repository/visibility/branch are confirmed or already unambiguous.
- Pre-push gates pass and pushed content has no secrets/private data/unrelated changes.
- The expected commit SHA is visible at the confirmed remote branch and CI state is reported.
- Browser navigation happens only after successful push verification.
- The final browser page is an official registration form, login/payment prerequisite, or existing
  Developer Dashboard, with no form submission or Store mutation performed.
- The handoff explicitly states: no fee paid, no registration submitted, no item uploaded, no review
  requested and nothing published.

## Execution handoff plan

1. Finish implementation and all automated/manual verification in the isolated worktree.
2. Review diff, commit scope, assets, package contents and secret/privacy scan results.
3. Resolve the personal GitHub owner/name/visibility and inspect any existing remote read-only.
4. Push normally; verify the remote SHA and report CI.
5. Open the official Chrome Web Store developer registration entry in the user's browser.
6. Stop immediately on the form/prerequisite/dashboard and return control to the user with the explicit
   non-actions listed above.
