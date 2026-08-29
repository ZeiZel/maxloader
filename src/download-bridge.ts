import { ARMED_ATTRIBUTE, CAPTURE_EVENT, CHANNEL, FALLBACK_ATTRIBUTE, HOOK_ATTRIBUTE, isCaptureDetail, type DownloadRequest, type DownloadResponse } from './protocol';

export interface BridgeStats { started: number; failed: number }

export interface DownloadBridge {
  /** Взводит перехват. false — MAIN-хук не установлен, страница качает сама. */
  arm(): boolean;
  disarm(): void;
  /**
   * Скачать по готовой ссылке — для фото, видео и голосовых, где ссылка CDN уже есть
   * в DOM и перехватывать нечего. Учитывается тем же счётчиком, что и перехваченные.
   */
  download(href: string, filename: string): void;
  /** Ждёт, пока обработаются пойманные ссылки (или истечёт время). */
  settle(expected: number, timeoutMs: number): Promise<BridgeStats>;
  stats(): BridgeStats;
  dispose(): void;
}

export type SendMessage = (request: DownloadRequest) => Promise<DownloadResponse>;

const defaultSend: SendMessage = (request) => chrome.runtime.sendMessage(request);

/** Запасной путь: качаем силами страницы. Наш якорь живёт в isolated-мире, хук его не перехватит. */
function fallbackDownload(doc: Document, href: string, filename: string): void {
  const anchor = doc.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.setAttribute(FALLBACK_ATTRIBUTE, '1');
  anchor.style.display = 'none';
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function createDownloadBridge(
  win: Window & typeof globalThis = window,
  send: SendMessage = defaultSend,
): DownloadBridge {
  const root = win.document.documentElement;
  let started = 0;
  let failed = 0;
  let seen = 0;
  const inFlight = new Set<Promise<void>>();
  let notify: (() => void) | undefined;

  const handle = (href: string, filename: string) => {
    seen += 1;
    const task = send({ channel: CHANNEL, type: 'download', href, filename })
      .then((response) => {
        if (response?.ok) { started += 1; return; }
        failed += 1;
        fallbackDownload(win.document, href, filename);
      })
      .catch(() => {
        failed += 1;
        try { fallbackDownload(win.document, href, filename); } catch { /* страница уже ушла */ }
      })
      .finally(() => { inFlight.delete(task); notify?.(); });
    inFlight.add(task);
    notify?.();
  };

  const onCapture = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isCaptureDetail(detail)) return;
    handle(detail.href, detail.filename);
  };

  win.document.addEventListener(CAPTURE_EVENT, onCapture);

  return {
    arm() {
      started = 0; failed = 0; seen = 0;
      root.setAttribute(ARMED_ATTRIBUTE, '1');
      return root.hasAttribute(HOOK_ATTRIBUTE);
    },
    disarm() { root.removeAttribute(ARMED_ATTRIBUTE); },
    download(href, filename) { handle(href, filename); },
    settle(expected, timeoutMs) {
      return new Promise<BridgeStats>((resolve) => {
        const done = () => { notify = undefined; win.clearTimeout(timer); resolve({ started, failed }); };
        const timer = win.setTimeout(done, timeoutMs);
        notify = () => { if (seen >= expected && inFlight.size === 0) done(); };
        notify();
      });
    },
    stats: () => ({ started, failed }),
    dispose() { win.document.removeEventListener(CAPTURE_EVENT, onCapture); notify = undefined; },
  };
}
