import {
  OWN_BUTTON_ATTRIBUTE,
  createOwnButton,
  findActionPanel,
  findOwnButtons,
  selectedItems,
  setOwnButtonLabel,
  updateOwnButton,
} from './dom';
import { DOWNLOAD_INTERVAL_MS, runDownloadQueue } from './download-queue';
import { createDownloadBridge, type DownloadBridge } from './download-bridge';

/** Сколько держать итоговую надпись («Готово: 3/3»), не перетирая её реконсиляцией. */
export const RESULT_HOLD_MS = 4000;
/** Сколько ждём, пока chrome.downloads примет все пойманные ссылки. */
export const SETTLE_TIMEOUT_MS = 8000;

export interface MaxLoaderController { start(): void; stop(): void; reconcile(): void; schedule(): void; isRunning(): boolean; }

export function createController(
  doc: Document = document,
  intervalMs = DOWNLOAD_INTERVAL_MS,
  makeBridge: () => DownloadBridge = () => createDownloadBridge(doc.defaultView as Window & typeof globalThis),
): MaxLoaderController {
  let observer: MutationObserver | undefined;
  let pending: { id: number; type: 'raf' | 'timeout' } | undefined;
  let running = false;
  let holdLabelUntil = 0;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const removeAll = () => doc.querySelectorAll<HTMLButtonElement>(`button[${OWN_BUTTON_ATTRIBUTE}]`).forEach((button) => button.remove());

  const download = (own: HTMLButtonElement) => {
    const bridge = makeBridge();
    // Взводим синхронно: первый клик очереди уйдёт уже при поднятом флаге.
    const hooked = bridge.arm();
    running = true;
    own.disabled = true;

    return runDownloadQueue({
      doc,
      intervalMs,
      download: (href, filename) => bridge.download(href, filename),
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
      .catch(() => console.warn('[Max Loader] download queue failed'))
      .finally(() => {
        bridge.disarm();
        bridge.dispose();
        running = false;
        own.disabled = false;
        holdLabelUntil = now() + RESULT_HOLD_MS;
      });
  };

  const reconcileDom = () => {
    const panel = findActionPanel(doc);
    const downloads = selectedItems(doc);
    if (!panel || downloads.length === 0) {
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

    if (!running && now() >= holdLabelUntil) updateOwnButton(own, downloads.length);
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
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') pending = { id: window.requestAnimationFrame(reconcile), type: 'raf' };
    else pending = { id: globalThis.setTimeout(reconcile, 50) as unknown as number, type: 'timeout' };
  };

  const isOwnMutation = (record: MutationRecord) => {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    return Boolean(target?.closest(`button[${OWN_BUTTON_ATTRIBUTE}]`));
  };

  return {
    start() {
      if (observer || !doc.body) return;
      observer = new MutationObserver((records) => {
        if (records.every(isOwnMutation)) return;
        schedule();
      });
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      schedule();
    },
    stop() {
      observer?.disconnect(); observer = undefined;
      if (pending !== undefined) {
        if (pending.type === 'raf' && typeof window !== 'undefined') window.cancelAnimationFrame(pending.id);
        else globalThis.clearTimeout(pending.id);
        pending = undefined;
      }
      removeAll();
    },
    reconcile: reconcileDom, schedule, isRunning: () => running,
  };
}
