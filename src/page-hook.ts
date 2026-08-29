import { ARMED_ATTRIBUTE, ARM_TIMEOUT_MS, CAPTURE_EVENT, FALLBACK_ATTRIBUTE, HOOK_ATTRIBUTE, RUN_ATTRIBUTE, SEQUENCE_ATTRIBUTE } from './protocol';

/**
 * Живёт в MAIN-мире страницы.
 *
 * MAX скачивает файл так: создаёт `<a href="https://fd.oneme.ru/getfile?..." download="имя">`
 * и кликает по нему. Второе и последующие такие скачивания подряд Chrome режет
 * лимитером «Скачивание нескольких файлов» — из-за этого доходил только первый файл.
 *
 * Пока на <html> висит ARMED_ATTRIBUTE, хук перехватывает такой клик, отдаёт ссылку
 * контент-скрипту (а тот — service worker'у с chrome.downloads) и не даёт странице
 * качать самой. Без флага поведение страницы не меняется.
 */
export function installPageHook(win: Window & typeof globalThis): () => void {
  const anchorProto = win.HTMLAnchorElement.prototype;
  const originalClick = anchorProto.click;
  const root = win.document.documentElement;
  let timer: number | undefined;

  const armed = () => root.hasAttribute(ARMED_ATTRIBUTE);

  anchorProto.click = function patchedClick(this: HTMLAnchorElement) {
    const filename = this.getAttribute('download');
    const href = this.href;
    if (!armed() || filename === null || !/^https?:/i.test(href)) return originalClick.call(this);
    if (this.hasAttribute(FALLBACK_ATTRIBUTE)) return originalClick.call(this);
    const run = root.getAttribute(RUN_ATTRIBUTE);
    const sequence = Number(root.getAttribute(SEQUENCE_ATTRIBUTE));
    if (!run || !Number.isInteger(sequence)) return originalClick.call(this);
    win.document.dispatchEvent(new win.CustomEvent(CAPTURE_EVENT, { detail: { href, filename, run, sequence } }));
    // Страховка от зависшего флага: очередь обязана снять его сама, но если она
    // умерла, через ARM_TIMEOUT_MS страница снова качает обычным образом.
    if (timer !== undefined) clearTimeout(timer);
    timer = win.setTimeout(() => root.removeAttribute(ARMED_ATTRIBUTE), ARM_TIMEOUT_MS);
  };

  root.setAttribute(HOOK_ATTRIBUTE, '1');

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    root.removeAttribute(HOOK_ATTRIBUTE);
    anchorProto.click = originalClick;
  };
}
