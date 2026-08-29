import {
  OWN_BUTTON_ATTRIBUTE,
  createOwnButton,
  findActionPanel,
  findOwnButtons,
  selectedItems,
  selectedMessages,
  setOwnButtonLabel,
  updateOwnButton,
} from './dom';
import { DOWNLOAD_INTERVAL_MS, runDownloadQueue } from './download-queue';
import { hasPendingMedia } from './media';
import { createDownloadBridge, type DownloadBridge } from './download-bridge';
import type { Logger } from './ports/logger';
import type { Scheduler } from './ports/scheduler';

/** Сколько держать итоговую надпись («Готово: 3/3»), не перетирая её реконсиляцией. */
export const RESULT_HOLD_MS = 4000;
/** Сколько ждём, пока chrome.downloads примет все пойманные ссылки. */
export const SETTLE_TIMEOUT_MS = 8000;

export interface MaxLoaderController { start(): void; stop(): void; reconcile(): void; schedule(): void; isRunning(): boolean; }

export interface ControllerDeps {
  doc: Document;
  createObserver: (callback: MutationCallback) => MutationObserver;
  scheduler: Scheduler;
  logger: Logger;
  intervalMs: number;
  makeBridge: () => DownloadBridge;
  createAbort: () => AbortController;
  runQueue?: typeof runDownloadQueue;
}

export function createController(deps: ControllerDeps): MaxLoaderController {
  const { doc, intervalMs, makeBridge, scheduler, logger, createAbort, createObserver } = deps;
  const runQueue = deps.runQueue ?? runDownloadQueue;
  let observer: MutationObserver | undefined;
  let pending: { id: number; type: 'raf' | 'timeout' } | undefined;
  let running = false;
  let holdLabelUntil = 0;
  let activeBridge: DownloadBridge | undefined;
  let activeAbort: AbortController | undefined;

  const now = () => scheduler.now();
  const removeAll = () => doc.querySelectorAll<HTMLButtonElement>(`button[${OWN_BUTTON_ATTRIBUTE}]`).forEach((button) => button.remove());

  const download = (own: HTMLButtonElement) => {
    const bridge = makeBridge();
    activeBridge = bridge;
    activeAbort = createAbort();
    // Взводим синхронно: первый клик очереди уйдёт уже при поднятом флаге.
    const hooked = bridge.arm();
    running = true;
    own.disabled = true;

    return runQueue({
      doc,
      intervalMs,
      download: (href, filename) => bridge.download(href, filename),
      expectCapture: () => bridge.expectCapture(),
      logger,
      sleep: scheduler.sleep,
      signal: activeAbort.signal,
      onProgress: (completed, total) => {
        setOwnButtonLabel(own, `Скачивание ${completed}/${total}`);
      },
    })
      .then(async ({ completed, direct, errors, total }) => {
        // Без MAIN-хука документы качает сама страница и посчитать их нечем,
        // а фото/видео/голосовые идут прямой ссылкой и считаются всегда.
        const expected = hooked ? completed : direct;
        if (expected === 0) {
          return errors ? `Скачано ${completed}, ошибок ${errors}` : `Готово: ${completed}/${total}`;
        }
        const { started } = await bridge.settle(expected, SETTLE_TIMEOUT_MS);
        const saved = hooked ? started : started + (completed - direct);
        return saved === total ? `Готово: ${saved}/${total}` : `Скачано ${saved} из ${total}`;
      })
      .then((label) => { setOwnButtonLabel(own, label); })
      .catch(() => logger.warn('download-queue-failed'))
      .finally(() => {
        bridge.disarm();
        bridge.dispose();
        if (activeBridge === bridge) { activeBridge = undefined; activeAbort = undefined; }
        running = false;
        own.disabled = false;
        holdLabelUntil = now() + RESULT_HOLD_MS;
      });
  };

  const reconcileDom = () => {
    const panel = findActionPanel(doc);
    const downloads = selectedItems(doc);
    const pending = selectedMessages(doc).some((message) => hasPendingMedia(message));
    if (!panel || (downloads.length === 0 && !pending)) {
      if (!running) removeAll();
      return;
    }
    doc.querySelectorAll<HTMLButtonElement>(`button[${OWN_BUTTON_ATTRIBUTE}]`).forEach((button) => {
      if (!panel.element.contains(button)) button.remove();
    });
    const panelButtons = findOwnButtons(panel.element);
    panelButtons.slice(1).forEach((button) => button.remove());
    const own = panelButtons[0] ?? createOwnButton(downloads.length, doc);
    if (!panelButtons[0]) panel.element.append(own);

    if (!running && now() >= holdLabelUntil) {
      if (pending) {
        setOwnButtonLabel(own, 'Скачать файлы');
        own.setAttribute('aria-description', 'Количество уточняется при скачивании');
      } else updateOwnButton(own, downloads.length);
    }
    if (own.disabled !== running) own.disabled = running;

    if (own.dataset.maxLoaderBound === 'true') return;
    own.dataset.maxLoaderBound = 'true';
    own.addEventListener('click', () => { if (!running) void download(own); });
  };

  const schedule = () => {
    if (pending !== undefined) return;
    const reconcile = () => {
      pending = undefined;
      reconcileDom();
      // Мутации, которые мы сами только что внесли, не должны будить нас снова.
      observer?.takeRecords();
    };
    pending = { id: scheduler.request(reconcile), type: 'raf' };
  };

  const isOwnMutation = (record: MutationRecord) => {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    return Boolean(target?.closest(`button[${OWN_BUTTON_ATTRIBUTE}]`));
  };

  return {
    start() {
      if (observer || !doc.body) return;
      observer = createObserver((records) => {
        if (records.every(isOwnMutation)) return;
        schedule();
      });
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      schedule();
    },
    stop() {
      observer?.disconnect(); observer = undefined;
      if (pending !== undefined) {
        scheduler.cancel(pending.id);
        pending = undefined;
      }
      removeAll();
      activeAbort?.abort();
      activeBridge?.disarm();
      activeBridge?.dispose();
      activeAbort = undefined;
      activeBridge = undefined;
    },
    reconcile: reconcileDom, schedule, isRunning: () => running,
  };
}
