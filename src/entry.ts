import { createController } from './content';
import { createDownloadBridge } from './download-bridge';
import { createRedactedLogger } from './ports/logger';
import { DOWNLOAD_INTERVAL_MS } from './download-queue';

if (typeof document !== 'undefined' && document.body) {
  const browserWindow = window;
  const scheduler = {
    now: () => browserWindow.performance.now(),
    sleep: (ms: number) => new Promise<void>((resolve) => browserWindow.setTimeout(resolve, ms)),
    request: (callback: () => void) => browserWindow.requestAnimationFrame(callback),
    cancel: (id: number) => browserWindow.cancelAnimationFrame(id),
  };
  const controller = createController({
    doc: document,
    createObserver: (callback) => new browserWindow.MutationObserver(callback),
    scheduler,
    logger: createRedactedLogger((level, event, fields) => {
      const sink = level === 'warn' ? browserWindow.console.warn : browserWindow.console.debug;
      sink.call(browserWindow.console, `[Max Loader] ${event}`, fields);
    }),
    intervalMs: DOWNLOAD_INTERVAL_MS,
    makeBridge: () => createDownloadBridge({
      win: browserWindow,
      send: (request) => chrome.runtime.sendMessage(request),
      now: () => browserWindow.performance.now(),
      random: () => browserWindow.Math.random(),
    }),
    createAbort: () => new browserWindow.AbortController(),
  });
  controller.start();
  window.addEventListener('pagehide', () => controller.stop(), { once: true });
}
