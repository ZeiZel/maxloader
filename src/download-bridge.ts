import { ARMED_ATTRIBUTE, CAPTURE_EVENT, CHANNEL, FALLBACK_ATTRIBUTE, HOOK_ATTRIBUTE, RUN_ATTRIBUTE, SEQUENCE_ATTRIBUTE, isCaptureDetail, type DownloadRequest, type DownloadResponse } from './protocol';
import { validateDownloadRequest } from './domain/download-policy';

export interface BridgeStats { started: number; failed: number }

export interface DownloadBridge {
  /** Взводит перехват. false — MAIN-хук не установлен, страница качает сама. */
  arm(): boolean;
  /** Разрешает ровно один следующий документный capture в текущем run. */
  expectCapture(sequence?: number): void;
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

export interface BridgeDeps {
  win: Window & typeof globalThis;
  send: SendMessage;
  now: () => number;
  random: () => number;
}

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

export function createDownloadBridge({ win, send, now, random }: BridgeDeps): DownloadBridge {
  const root = win.document.documentElement;
  let started = 0;
  let failed = 0;
  let seen = 0;
  const inFlight = new Set<Promise<void>>();
  let notify: (() => void) | undefined;
  let expectedCaptures = 0;
  const expectedSequences = new Set<number>();
  let runId = '';
  let nextSequence = 0;
  let expectationTimer: number | undefined;

  const disarm = (): void => {
    root.removeAttribute(ARMED_ATTRIBUTE);
    root.removeAttribute(RUN_ATTRIBUTE);
    root.removeAttribute(SEQUENCE_ATTRIBUTE);
    expectedCaptures = 0;
    expectedSequences.clear();
    if (expectationTimer !== undefined) win.clearTimeout(expectationTimer);
    expectationTimer = undefined;
  };

  const handle = (href: string, filename: string) => {
    if (!validateDownloadRequest({ channel: CHANNEL, type: 'download', href, filename }).ok) return;
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
    if (!root.hasAttribute(ARMED_ATTRIBUTE) || expectedCaptures <= 0) return;
    if (detail.run !== runId || detail.sequence === undefined || !expectedSequences.has(detail.sequence)) return;
    expectedCaptures -= 1;
    expectedSequences.delete(detail.sequence);
    if (expectedCaptures === 0 && expectationTimer !== undefined) { win.clearTimeout(expectationTimer); expectationTimer = undefined; }
    handle(detail.href, detail.filename);
  };

  win.document.addEventListener(CAPTURE_EVENT, onCapture);

  return {
    arm() {
      started = 0; failed = 0; seen = 0;
      expectedCaptures = 0;
      expectedSequences.clear();
      if (expectationTimer !== undefined) { win.clearTimeout(expectationTimer); expectationTimer = undefined; }
      runId = `${now().toString(36)}-${random().toString(36).slice(2)}`;
      nextSequence = 0;
      root.setAttribute(ARMED_ATTRIBUTE, '1');
      root.setAttribute(RUN_ATTRIBUTE, runId);
      return root.hasAttribute(HOOK_ATTRIBUTE);
    },
    expectCapture(sequence) {
      if (!root.hasAttribute(ARMED_ATTRIBUTE)) return;
      expectedCaptures += 1;
      const expected = sequence ?? ++nextSequence;
      expectedSequences.add(expected);
      root.setAttribute(SEQUENCE_ATTRIBUTE, String(expected));
      if (expectationTimer !== undefined) win.clearTimeout(expectationTimer);
      expectationTimer = win.setTimeout(disarm, 1200);
    },
    disarm,
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
