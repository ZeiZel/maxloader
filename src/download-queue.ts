import { selectedItems, selectedMessages, semanticMessageId, type SelectedItem } from './dom';
import { hasPendingMedia } from './media';
import { VOICE_RESOLVE_TIMEOUT_MS, resolveVoiceHref, voiceItem } from './voice';
import { type Logger } from './ports/logger';

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
  doc: Document;
  intervalMs?: number;
  renderWaitMs?: number;
  onProgress?: (completed: number, total: number) => void;
  sleep: (ms: number) => Promise<void>;
  expectCapture?: () => void;
  logger: Logger;
  signal?: AbortSignal;
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
  const doc = deps.doc;
  const intervalMs = deps.intervalMs ?? DOWNLOAD_INTERVAL_MS;
  const renderWaitMs = deps.renderWaitMs ?? RENDER_WAIT_MS;
  const logger = deps.logger;
  const cancelled = () => deps.signal?.aborted === true;
  const rawSleep = deps.sleep;
  const sleep = async (ms: number): Promise<void> => {
    if (cancelled()) return;
    if (!deps.signal) { await rawSleep(ms); return; }
    await new Promise<void>((resolve) => {
      const onAbort = () => { deps.signal?.removeEventListener('abort', onAbort); resolve(); };
      deps.signal?.addEventListener('abort', onAbort, { once: true });
      void rawSleep(ms).then(() => { deps.signal?.removeEventListener('abort', onAbort); resolve(); });
    });
  };

  const messages = selectedMessages(doc).map((original) => ({
    original,
    marker: original.querySelector<HTMLElement>('.selection--status-selected'),
    semanticId: semanticMessageId(original),
    attachmentIdentities: selectedItems(doc).filter((item) => item.message === original).map((item) => ({
      kind: item.kind,
      node: item.kind === 'file' ? item.button : item.kind === 'voice' ? item.play : undefined,
      href: item.kind === 'media' ? item.item.href : undefined,
    })),
  }));
  const done = new Set<string>();
  let completed = 0;
  let errors = 0;
  let direct = 0;
  let started = false;
  let total = selectedItems(doc).length;
  const report = () => deps.onProgress?.(completed, Math.max(total, completed));

  report();

  for (const locator of messages) {
    if (cancelled()) break;
    const current = resolveMessage(doc, locator);
    if (!current) continue;

    // Ленивый альбом: подводим к экрану и даём время на отрисовку, иначе ссылок не будет.
    if (hasPendingMedia(current)) {
      // jsdom и старые движки не реализуют scrollIntoView — отсутствие прокрутки
      // не повод ронять очередь, просто плитка может остаться неотрисованной.
      try {
        current.scrollIntoView?.({ block: 'center' });
      } catch {
        /* прокрутка недоступна */
      }
      await sleep(renderWaitMs);
      if (cancelled()) break;
    }

    const items = selectedItems(doc).filter((item) => item.message === current && !done.has(item.key));
    total = Math.max(total, done.size + items.length);

    for (const item of items) {
      if (cancelled()) break;
      const refreshed = resolveMessage(doc, locator);
      if (!refreshed) break;
      const currentItems = selectedItems(doc).filter((candidate) => candidate.message === refreshed);
      const fresh = matchItem(item, currentItems);
      if (!fresh) break;
      // Пауза именно между вложениями: сон после последнего только задерживал
      // итоговую надпись, ничего при этом не разгружая.
      if (started) {
        await sleep(intervalMs);
        if (cancelled()) break;
      }
      if (cancelled()) break;
      started = true;
      done.add(item.key);
      try {
        if (item.kind === 'file') deps.expectCapture?.();
        await runItem(fresh, doc, deps.download, sleep, cancelled);
        completed += 1;
        if (item.kind !== 'file') direct += 1;
      } catch {
        if (cancelled()) break;
        errors += 1;
        logger.warn('download-item-failed', { kind: item.kind });
      }
      report();
    }
  }

  return { completed, errors, direct, total: Math.max(total, completed) };
}

interface MessageLocator {
  original: HTMLElement;
  marker: HTMLElement | null;
  semanticId?: string;
  /**
   * For wrappers without a semantic id, retain the bounded attachment node
   * identity. A connected Svelte wrapper can be recycled in place while its
   * selection marker survives; in that case we must fail closed.
   */
  attachmentIdentities: { kind: SelectedItem['kind']; node?: Element; href?: string }[];
}

function resolveMessage(doc: Document, locator: MessageLocator): HTMLElement | undefined {
  const originalMarker = locator.marker;
  if (locator.original.isConnected) {
    const currentMarker = locator.original.querySelector<HTMLElement>('.selection--status-selected');
    // A connected recycled node is not safe: the marker identity must remain the same.
    if (!currentMarker || currentMarker !== originalMarker) return undefined;
    if (!locator.semanticId && locator.attachmentIdentities.length > 0) {
      const currentItems = selectedItems(doc).filter((item) => item.message === locator.original);
      if (currentItems.length !== locator.attachmentIdentities.length) return undefined;
      const sameIdentity = currentItems.every((item, index) => {
        const expected = locator.attachmentIdentities[index];
        const node = item.kind === 'file' ? item.button : item.kind === 'voice' ? item.play : undefined;
        const href = item.kind === 'media' ? item.item.href : undefined;
        return item.kind === expected.kind && node === expected.node && href === expected.href;
      });
      if (!sameIdentity) return undefined;
    }
    return locator.original;
  }
  if (!locator.semanticId) return undefined;
  const [attr, value] = locator.semanticId.split(':');
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(`.messageWrapper[${attr}]`))
    .filter((message) => message.getAttribute(attr) === value && message.querySelector('.selection--status-selected'));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function matchItem(original: SelectedItem, current: SelectedItem[]): SelectedItem | undefined {
  if (original.kind === 'file') {
    return current.find((item): item is Extract<SelectedItem, { kind: 'file' }> => item.kind === 'file' && item.index === original.index && item.fingerprint === original.fingerprint);
  }
  if (original.kind === 'media') return current.find((item) => item.kind === 'media' && item.item.href === original.item.href);
  return current.find((item) => item.kind === 'voice' && item.index === 0);
}

async function runItem(
  item: SelectedItem,
  doc: Document,
  download: (href: string, filename: string) => void,
  sleep: (ms: number) => Promise<void>,
  isCancelled: () => boolean,
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
  if (isCancelled()) return;
  if (!href) throw new Error('voice source did not resolve');
  const voice = voiceItem(href, 0);
  download(voice.href, voice.filename);
}
