import { mediaItems, voicePlayButton, type MediaItem } from './media';

/** Контейнер одного сообщения в ленте. */
export const MESSAGE_SELECTOR = '.messageWrapper';
/**
 * Признак «сообщение выбрано» — галочка в кружке слева.
 *
 * Ориентироваться на `messageWrapper--selection` нельзя: этот класс MAX вешает на ВСЕ
 * сообщения, как только включён режим выбора. По нему расширение забирало вложения
 * всего чата (при «Выбрано 1» кнопка предлагала 12 файлов), а не выделенных сообщений.
 */
export const SELECTED_MARK_SELECTOR = '.selection--status-selected';
export const DOWNLOAD_SELECTOR = 'button[aria-label="Скачать"]';
export const OWN_BUTTON_ATTRIBUTE = 'data-max-loader-action';
export const MESSAGE_KEY_SELECTOR = '[data-index]';
/** Классы кнопок самого MAX — чтобы наша кнопка не выбивалась из топбара. */
export const APP_BUTTON_CLASSES = 'button button--xsmall button--ghost svelte-1pwsock';
export const OWN_BUTTON_CLASSES = `${APP_BUTTON_CLASSES} max-loader-button`;

export interface ActionPanel {
  element: HTMLElement;
  downloadButton: HTMLButtonElement | null;
}

/**
 * Одно вложение выделенного сообщения. Ключ стабилен между перерисовками Svelte,
 * поэтому очередь переискивает элемент по ключу, а не держит протухший узел.
 *
 * - `file`  — документ: кликаем кнопку MAX, ссылку ловит MAIN-хук;
 * - `media` — фото/видео: прямая ссылка CDN уже есть в DOM;
 * - `voice` — голосовое: ссылку выдаёт только проигрывание.
 */
export type SelectedItem =
  | { kind: 'file'; key: string; message: HTMLElement; button: HTMLButtonElement }
  | { kind: 'media'; key: string; message: HTMLElement; item: MediaItem }
  | { kind: 'voice'; key: string; message: HTMLElement; play: HTMLButtonElement };

const normalized = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

function messageKey(message: HTMLElement, fallbackIndex: number): string {
  return message.closest<HTMLElement>(MESSAGE_KEY_SELECTOR)?.getAttribute('data-index') ?? `m${fallbackIndex}`;
}

export function selectedMessages(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR)).filter(
    (message) => message.querySelector(SELECTED_MARK_SELECTOR) !== null,
  );
}

/**
 * Все вложения выделенных сообщений: документы, фото, видео и голосовые.
 *
 * Плитки альбома рендерятся лениво, поэтому у сообщения вне зоны видимости медиа
 * ещё не найдётся — очередь подводит его к экрану и перечитывает по тому же ключу.
 */
export function selectedItems(root: ParentNode = document): SelectedItem[] {
  const result: SelectedItem[] = [];
  selectedMessages(root).forEach((message, messageIndex) => {
    const key = messageKey(message, messageIndex);

    Array.from(message.querySelectorAll<HTMLButtonElement>(DOWNLOAD_SELECTOR)).forEach((button, index) => {
      if (!button.isConnected || button.disabled) return;
      result.push({ kind: 'file', key: `${key}:file:${index}`, message, button });
    });

    mediaItems(message).forEach((item, index) => {
      result.push({ kind: 'media', key: `${key}:${item.kind}:${index}`, message, item });
    });

    const play = voicePlayButton(message);
    if (play?.isConnected && !play.disabled) {
      result.push({ kind: 'voice', key: `${key}:voice:0`, message, play });
    }
  });
  return result;
}

export function findActionPanel(root: ParentNode = document): ActionPanel | null {
  const counter = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    /^Выбрано\s+\d+$/.test(normalized(button.textContent)),
  );
  if (!counter) return null;
  let current: HTMLElement | null = counter;
  while (current) {
    const buttons = Array.from(current.querySelectorAll<HTMLButtonElement>('button'));
    const hasDelete = buttons.some((button) => normalized(button.textContent) === 'Удалить');
    const hasForward = buttons.some((button) => normalized(button.textContent) === 'Переслать');
    if (hasDelete && hasForward) return { element: current, downloadButton: null };
    current = current.parentElement;
  }
  return null;
}

export function findOwnButton(panel: HTMLElement): HTMLButtonElement | null {
  return panel.querySelector<HTMLButtonElement>(`button[${OWN_BUTTON_ATTRIBUTE}]`);
}

export function findOwnButtons(panel: ParentNode): HTMLButtonElement[] {
  return Array.from(panel.querySelectorAll<HTMLButtonElement>(`button[${OWN_BUTTON_ATTRIBUTE}]`));
}

export function createOwnButton(count: number, doc: Document = document): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.setAttribute(OWN_BUTTON_ATTRIBUTE, 'download-selected');
  button.className = OWN_BUTTON_CLASSES;
  setOwnButtonLabel(button, `Скачать файлы (${count})`);
  return button;
}

/**
 * Пишет в DOM только при реальном изменении: безусловная запись textContent
 * порождает мутацию, MutationObserver будит reconcile — и кнопка перерисовывается по кругу.
 */
export function setOwnButtonLabel(button: HTMLButtonElement, label: string): boolean {
  let changed = false;
  if (button.textContent !== label) {
    button.textContent = label;
    changed = true;
  }
  if (button.getAttribute('aria-label') !== label) {
    button.setAttribute('aria-label', label);
    changed = true;
  }
  if (button.className !== OWN_BUTTON_CLASSES) {
    button.className = OWN_BUTTON_CLASSES;
    changed = true;
  }
  return changed;
}

export function updateOwnButton(button: HTMLButtonElement, count: number): boolean {
  return setOwnButtonLabel(button, `Скачать файлы (${count})`);
}
