# Max Loader

Chrome MV3 extension for `https://web.max.ru/*`. When MAX's message-selection mode contains file
messages, it adds **Скачать файлы (N)** to the selection action bar and downloads every attachment
of the selected messages in one click — documents, photos, videos and voice messages.

## How it downloads

MAX downloads a file by building `<a href="https://fd.oneme.ru/getfile?…" download="имя">` and
clicking it. Chrome's `DownloadRequestLimiter` throttles the second and later page-initiated
downloads of a burst, so a naive "click each button" approach delivered exactly one file.

So the extension splits the work across three scripts:

| Script          | World    | Job                                                                       |
| --------------- | -------- | ------------------------------------------------------------------------- |
| `page-hook.js`  | MAIN     | While armed, intercepts the app's anchor click and reports the file URL.  |
| `content.js`    | isolated | Renders the button, clicks MAX's buttons in order, forwards captured URLs. |
| `background.js` | worker   | Runs `chrome.downloads.download()` — not subject to the page limiter.     |

Arming is a `data-max-loader-armed` attribute on `<html>` rather than a message: the DOM is shared
between the two worlds, so the hook sees the flag synchronously, already on the queue's first click.
Captured links travel back as a `CustomEvent` on `document`, which — unlike `postMessage` — cannot
be forged by a nested iframe.

If the MAIN-world hook did not install, or `chrome.downloads` refuses a URL, the extension falls
back to a plain page download, and Chrome may ask to allow multiple downloads for `web.max.ru`.

## Attachment types

Only documents expose a download button; everything else is read straight from the DOM
(verified against the live app on 2026-08-27):

| Type     | Where the link lives                    | Host              | Saved as |
| -------- | --------------------------------------- | ----------------- | -------- |
| document | MAX's own `Скачать` button → `<a download>` | fd.oneme.ru   | original |
| photo    | `.media .tile img[src]`                 | i.oneme.ru        | `.webp`  |
| video    | `.media .tile video source[src]`        | maxvd*.okcdn.ru   | `.mp4`   |
| voice    | appears only during playback            | a.oneme.ru        | `.ogg`   |

Two traps the selectors have to dodge. MAX also puts the `media` class on link previews inside
message text (`span.media` in a `button.cell--webapp`), so an attachment must sit in a gallery
`.tile` — otherwise a VK preview thumbnail lands in Downloads as a photo. And a tile that holds a
`<video>` may also hold an `<img>`: that image is the poster, not a second attachment.

A voice message has no link in the DOM at all — MAX keeps one shared `<audio>` for the whole app
and only sets `src` when playback starts. The extension presses play, reads the URL and immediately
stops. **Side effect: the voice message is then marked as listened.** There is no way around it —
the server hands out the link only for playback.

Gallery tiles render lazily, so a message far off-screen has no links yet. The queue scrolls each
such message into view and re-reads it. A selection spanning many screens can still under-report
the attachment count until the run reaches those messages.

MAX's own media viewer downloads through a `blob:` URL with an empty `download` attribute, which a
service worker cannot accept — that is why the CDN link from the bubble is used instead. It serves
the same resolution the viewer does.

## Permissions

`downloads` — to save the attachments the user selected. No host permissions beyond the
`web.max.ru` content-script match, no network requests of its own, no data collection.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run package
```

Load `dist/` via `chrome://extensions` → Developer mode → Load unpacked. After rebuilding, press
reload on the extension card — content scripts are not hot-reloaded.

The Russian UI anchors (`Выбрано N`, `Удалить`, `Переслать`, `aria-label="Скачать"`) were verified
against the live app on 2026-08-27.
