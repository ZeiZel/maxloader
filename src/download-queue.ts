import { selectedItems, selectedMessages, type SelectedItem } from './dom';
import { hasPendingMedia } from './media';
import { VOICE_RESOLVE_TIMEOUT_MS, resolveVoiceHref, voiceItem } from './voice';

export const DOWNLOAD_INTERVAL_MS = 300;
/** Сколько ждём отрисовку лениво подгружаемых плиток после подвода сообщения к экрану. */
export const RENDER_WAIT_MS = 400;

export interface QueueResult {
  completed: number;
  errors: number;
  total: number;
  /**
   * Сколько скачано прямой ссылкой (фото/видео/голосовые). Эти не зависят от MAIN-хука,
   * поэтому считаются даже когда он не установился, — в отличие от кликов по документам.
   */
  direct: number;
}

export interface QueueDeps {
  /** Прямое скачивание по ссылке — минуя страницу, сразу в service worker. */
  download: (href: string, filename: string) => void;
  doc?: Document;
  intervalMs?: number;
  renderWaitMs?: number;
  onProgress?: (completed: number, total: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const usable = (element: HTMLElement | null | undefined): boolean =>
  Boolean(element) && element!.isConnected && !(element as HTMLButtonElement).disabled;

/**
 * Скачивает все вложения выделенных сообщений.
 *
 * Обход идёт по сообщениям, а не по плоскому снапшоту вложений, по двум причинам:
 * между скачиваниями MAX перерисовывает список и заменяет узлы, а плитки альбома
 * рендерятся лениво — у сообщения вне зоны видимости ссылок ещё нет. Поэтому каждое
 * сообщение сначала подводится к экрану, и только потом с него читаются вложения.
 */
export async function runDownloadQueue(deps: QueueDeps): Promise<QueueResult> {
  const doc = deps.doc ?? document;
  const intervalMs = deps.intervalMs ?? DOWNLOAD_INTERVAL_MS;
  const renderWaitMs = deps.renderWaitMs ?? RENDER_WAIT_MS;
  const sleep = deps.sleep ?? wait;

  const messages = selectedMessages(doc);
  const done = new Set<string>();
  let completed = 0;
  let errors = 0;
  let direct = 0;
  let started = false;
  let total = selectedItems(doc).length;
  const report = () => deps.onProgress?.(completed, Math.max(total, completed));

  report();

  for (const message of messages) {
    if (!message.isConnected) continue;

    // Ленивый альбом: подводим к экрану и даём время на отрисовку, иначе ссылок не будет.
    if (hasPendingMedia(message)) {
      // jsdom и старые движки не реализуют scrollIntoView — отсутствие прокрутки
      // не повод ронять очередь, просто плитка может остаться неотрисованной.
      try {
        message.scrollIntoView?.({ block: 'center' });
      } catch {
        /* прокрутка недоступна */
      }
      await sleep(renderWaitMs);
    }

    const items = selectedItems(doc).filter((item) => item.message === message && !done.has(item.key));
    total = Math.max(total, done.size + items.length);

    for (const item of items) {
      // Пауза именно между вложениями: сон после последнего только задерживал
      // итоговую надпись, ничего при этом не разгружая.
      if (started) await sleep(intervalMs);
      started = true;
      done.add(item.key);
      try {
        await runItem(item, doc, deps.download, sleep);
        completed += 1;
        if (item.kind !== 'file') direct += 1;
      } catch {
        errors += 1;
        console.warn(`[Max Loader] download item failed: ${item.key}`);
      }
      report();
    }
  }

  return { completed, errors, direct, total: Math.max(total, completed) };
}

async function runItem(
  item: SelectedItem,
  doc: Document,
  download: (href: string, filename: string) => void,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  if (item.kind === 'media') {
    download(item.item.href, item.item.filename);
    return;
  }

  if (item.kind === 'file') {
    if (!usable(item.button)) throw new Error('download button unavailable');
    item.button.click();
    return;
  }

  if (!usable(item.play)) throw new Error('voice play button unavailable');
  const href = await resolveVoiceHref(doc, item.play, VOICE_RESOLVE_TIMEOUT_MS, sleep);
  if (!href) throw new Error('voice source did not resolve');
  const voice = voiceItem(href, 0);
  download(voice.href, voice.filename);
}
