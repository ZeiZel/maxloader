# 01 — Architecture

## Scope and quality goals

The target keeps the working three-context MV3 design but makes boundaries explicit, testable and
defensive. Optimization means fewer redundant DOM scans/mutations, bounded work per queue run and
smaller failure blast radius; it does not mean premature caching of virtualized DOM nodes.

Priority order:

1. never download an attachment the user did not select;
2. never grant an untrusted page a general-purpose download primitive;
3. preserve MAX and unrelated media behavior;
4. remain recoverable when MAX rerenders or changes an observed DOM shape;
5. keep components small enough to test through narrow interfaces.

## Verified current facts and gaps

- The deployable topology already has three roots (`entry.ts`, `page-hook-entry.ts`,
  `background-entry.ts`) but most factories default to browser globals, so dependency ownership is
  not consistently explicit.
- `content.ts` combines lifecycle, observation, rendering, queue control, bridge settlement and time.
- `dom.ts` combines discovery, identity, presentation classes and attachment mapping; it copies a
  Svelte build hash.
- `data-index` and retained message/button objects are used through a queue run despite SPA
  virtualization.
- `CustomEvent` detail is shape-checked but not trustworthy. The service-worker listener ignores
  sender context and permits arbitrary HTTP(S) hosts.
- Voice cleanup affects all page audio.

## Architectural decisions

### A-01. Layers and dependency direction

```text
composition root -> adapters -> application/use cases -> domain values
                                 ^ ports (interfaces) ^
```

- Domain values and parsers contain no DOM or Chrome types where avoidable.
- Application use cases depend only on ports and immutable values.
- Adapters translate DOM/Chrome events into validated values.
- Composition roots instantiate concrete adapters and pass them manually to factories/constructors.
- No module imports a composition root. No global container or hidden singleton resolves dependencies.

Suggested project shape (names may change while responsibilities must remain):

```text
src/
  domain/
    attachment.ts          # kind, run-local identity, validated candidate
    download-policy.ts     # URL/filename/sender rules and rejection reasons
  application/
    reconcile-action.ts    # pure action-button state decision
    run-downloads.ts       # queue state machine
    capture-session.ts     # expected/correlated document captures
  ports/
    selected-messages.ts   # current selection and attachment discovery
    action-view.ts         # render/update/remove/progress
    scheduler.ts           # raf, timeout, sleep, monotonic time
    download-gateway.ts    # validated request/response
    capture-channel.ts     # arm/disarm/correlated capture
    playback.ts            # voice source resolution and scoped restoration
    logger.ts              # structured, redacted diagnostics
  adapters/
    max-dom/               # MAX-specific selectors, locators, observer
    chrome/                # runtime messaging, sender, downloads
    main-world/            # anchor hook and DOM event transport
  roots/
    content.ts
    page-hook.ts
    background.ts
```

Files need not mirror every interface one-to-one; small cohesive modules are preferred over ceremonial
layers.

### A-02. Exactly three composition roots

1. **Content/isolated root** creates MAX DOM discovery, action view, mutation scheduler, queue,
   capture client, runtime download client, playback adapter and redacted logger. It owns start/stop.
2. **MAIN-world root** creates the minimal anchor-click hook, arm-state reader, capture publisher and
   timeout. It has no download authority and no application orchestration.
3. **Background/service-worker root** creates the runtime listener, sender/request policy,
   `chrome.downloads` adapter and logger.

Tests call factories with fakes. Production entry files contain only composition and startup. Default
arguments that silently reach `window`, `document`, `chrome`, `performance` or timers are removed from
application modules; adapters may use those globals internally after being explicitly constructed.

### A-03. Reconciliation and DOM optimization

- One observer is installed per content root. Mutation batches schedule at most one pending
  reconciliation.
- Observer records caused exclusively by the extension subtree are ignored.
- Reconciliation reads DOM state, computes a desired view model, then applies only actual changes.
- Discovery is scoped to the known selection region/action panel when available; a full-document
  fallback is allowed only when a stable scope cannot be resolved and must be coalesced.
- The action uses extension-owned classes/data attributes only. MAX classes may inform measured style
  tokens at runtime if safe, but literal generated hashes are forbidden.
- Stop/navigation removes listeners, observer, pending schedules and extension DOM exactly once.

### A-04. Selection, identity and virtualization

`data-index`, DOM nodes and attachment ordinal are locators, not business identity.

At run start the queue records an ordered set of **run-local message locators**. A locator contains
only signals required to re-find the current selected message. Preferred stable semantic IDs are used
if MAX exposes them; otherwise the adapter assigns a run-local opaque identity and keeps a bounded
locator strategy. Before every action it must:

1. re-find the current message;
2. confirm the selection marker is still active;
3. scroll it into view only if discovery requires it;
4. wait through the injected scheduler for rendering to settle;
5. re-enumerate current attachments;
6. deduplicate only within the run using canonical URL for direct media and a run-local document
   capture/action identity;
7. abandon the locator if it now resolves ambiguously.

The queue must never fall back from an unresolved selected locator to “the message currently at the
same `data-index`.” If a node is replaced, the old node is not clicked.

### A-05. Lazy-only media and count semantics

The action's existence is based on “selected message may contain a supported attachment,” not only on
currently materialized media URLs. The view model has `knownCount` and `discoveryPending`:

- exact state: `Скачать файлы (N)`;
- selected attachment candidates exist but one or more are lazy/unresolved: `Скачать файлы` with an
  accessible description such as `Количество уточняется при скачивании`;
- no selected supported/potential attachment: no action.

At click time, discovery may increase the total as selected messages render. Progress therefore uses
`completed` plus a nondecreasing discovered total and must not announce a false final total before
discovery completes. Disabled/detached/ambiguous candidates become scoped errors, not clicks elsewhere.

### A-06. Voice playback ownership

Voice discovery remains an adapter because it is MAX-specific and inherently stateful.

- Snapshot the relevant shared audio state before clicking: element identity, source, paused state and
  current time where readable.
- Associate the changed/new source with the one play control invoked by the queue.
- Pause/reset only the audio element whose source/playback Max Loader caused.
- Restore pre-existing playback state when safe. Never iterate over and stop all page audio.
- If ownership cannot be established, fail that attachment and leave unrelated playback untouched.
- Keep the user disclosure that resolving a voice may mark it as listened; this release cannot promise
  to avoid that server-side effect.

### A-07. Untrusted capture and runtime message policy

The MAIN-to-isolated event transport is a transport, not an authentication boundary. A capture is
accepted only while an explicit user-started queue session is armed and while exactly one current
document action awaits capture. Use a run identifier/sequence and a very short capture window to
correlate results. A page can observe/forge DOM-visible values, so correlation is defense in depth,
not a secret capability.

Before any `chrome.downloads.download()` call, the background root validates:

- `sender.id === chrome.runtime.id`;
- a top-level tab context (`sender.tab` present and `sender.frameId === 0`);
- the sender tab/document URL parses to HTTPS origin `https://web.max.ru`;
- request is a plain object with the exact protocol version/type and bounded string fields;
- URL parses with `https:` and matches the allowlisted attachment kind, hostname and path policy;
- credentials, unexpected port and ambiguous/encoded hostname forms are rejected;
- filename is normalized to one safe basename, has a bounded UTF-8 length and contains no controls,
  separators, dot-only value or platform-forbidden characters;
- the request corresponds to an active, bounded capture/download session where applicable.

The allowlist starts from observed families but is implemented as explicit predicates, not loose
suffix tests:

- document: exact `fd.oneme.ru` plus verified `/getfile` path;
- photo: exact `i.oneme.ru` plus verified paths;
- voice: exact `a.oneme.ru` plus verified paths;
- video: only a verified `maxvd<allowed-label>.okcdn.ru` hostname shape and paths.

Fresh samples must confirm path predicates. Do not allow all `oneme.ru`, all `okcdn.ru`, arbitrary
HTTP(S), redirects chosen by request data or userinfo URLs. Rejection logs include a reason code and
attachment kind only, never full URL, filename, query, message text or user identifiers.

### A-08. Failure behavior

- One item failure does not abort unrelated items.
- A bridge timeout always disarms and releases session state.
- The fallback page download is permitted only for the same already-validated URL/filename pair and
  must not recursively re-enter the hook.
- No error path leaves the action disabled indefinitely.
- Removal of the content root or tab navigation cancels new work; in-flight Chrome downloads are not
  destructively cancelled.

## Assumptions and risks

- MAX markup and hosts remain observational. Adapters isolate change but cannot eliminate it.
- Exact host/path policy may need narrow updates after live evidence; broadening requires tests and a
  security review.
- There may be no durable message ID in DOM. In that case safe ambiguity failure is preferred over
  trying to guess identity.
- Browser-world transport cannot establish trust against the top-level page; the trusted enforcement
  point is the extension runtime listener with least privilege.

## Non-goals

- No server-side queue, proxy, URL signer or telemetry.
- No cached mirror of the entire MAX conversation DOM.
- No attempt to bypass a CDN expiry, Chrome prompt or unavailable media source.
- No framework-driven DI or generic enterprise layer for its own sake.

## Architecture acceptance criteria

- The dependency graph follows A-01 and all production dependencies are visibly wired in one of the
  three roots.
- Unit tests can run queue/reconcile/policy logic with no real browser globals.
- Static search of shipped source finds no literal `svelte-` hash.
- Rerender/recycled-index fixtures prove that an old or unselected node is never clicked.
- A lazy-only selected media fixture displays an action and discovers the item after render.
- An unrelated playing `<audio>` remains unchanged after both successful and failed voice resolution.
- A forged capture outside the exact armed expectation and every invalid runtime sender/URL/filename
  case are rejected before the downloads adapter.
- Current supported document/photo/video/voice happy paths remain green.

## Architecture migration plan

1. Add characterization tests around current roots and behavior.
2. Extract protocol/domain parsers and policy first; route the existing background through them.
3. Extract ports and inject scheduler/logger/download/capture/playback dependencies into use cases.
4. Move existing browser code into adapters without changing entry bundle names or manifest wiring.
5. Replace button style coupling and introduce pure desired-view reconciliation.
6. Introduce run-local locators and lazy discovery; remove durable `data-index` assumptions.
7. Scope voice ownership/restoration.
8. Delete compatibility code only after equivalent regression/security tests and live smoke pass.
