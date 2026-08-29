/**
 * Поиск медиавложений в сообщении.
 *
 * Документ MAX отдаёт кнопкой «Скачать», которая строит `<a download>` — её ловит MAIN-хук.
 * У фото, видео и голосовых такой кнопки нет, зато прямые ссылки CDN лежат прямо в DOM
 * (проверено на web.max.ru 2026-08-27):
 *
 * | тип       | где ссылка                         | хост            | тип файла  |
 * | --------- | ---------------------------------- | --------------- | ---------- |
 * | фото      | `.media img[src]`                  | i.oneme.ru      | image/webp |
 * | видео     | `.media video source[src]`         | maxvd*.okcdn.ru | video/mp4  |
 * | голосовое | появляется только при проигрывании | a.oneme.ru      | audio/ogg  |
 *
 * Просмотрщик MAX качает те же файлы через `blob:`-ссылку, которую service worker принять
 * не может, — поэтому берём CDN-ссылку из бабла. Она отдаёт то же разрешение, что и
 * просмотрщик, и не требует Referer.
 */

export const MEDIA_SELECTOR = '.media';
/**
 * Вложение обязано лежать в плитке галереи: класс `media` MAX вешает ещё и на превью
 * ссылки в тексте (`span.media` внутри `button.cell--webapp`), и без этого сужения
 * картинка VK-превью уезжала бы в загрузки как «фото».
 */
export const TILE_SELECTOR = '.tile';
export const VOICE_SELECTOR = '.attachAudio';
export const VOICE_PLAY_SELECTOR = '.attachAudio .buttonWrapper button';

export const IMAGE_EXTENSION = 'webp';
export const VIDEO_EXTENSION = 'mp4';
export const VOICE_EXTENSION = 'ogg';

export type MediaKind = 'photo' | 'video' | 'voice';

export interface MediaItem {
  kind: MediaKind;
  href: string;
  filename: string;
}

/** Параметры, которыми CDN идентифицирует файл, — из них получается стабильное имя. */
const ID_PARAMS = ['r', 'id', 'cid'];

function stableId(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return '';
  }
  for (const name of ID_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) return value.replace(/[^A-Za-z0-9_-]/g, '').slice(-16);
  }
  return '';
}

export function mediaExtension(kind: MediaKind): string {
  if (kind === 'photo') return IMAGE_EXTENSION;
  if (kind === 'video') return VIDEO_EXTENSION;
  return VOICE_EXTENSION;
}

export function mediaFilename(kind: MediaKind, href: string, fallbackIndex: number): string {
  const id = stableId(href) || String(fallbackIndex + 1);
  return `max-${kind}-${id}.${mediaExtension(kind)}`;
}

const isHttp = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^https?:/i.test(value);

/** Ссылка видео живёт в `<source>`; у самого `<video>` она появляется только после загрузки. */
function videoHref(video: HTMLVideoElement): string | undefined {
  const source = video.querySelector<HTMLSourceElement>('source[src]');
  if (isHttp(source?.src)) return source.src;
  return isHttp(video.currentSrc) ? video.currentSrc : undefined;
}

/**
 * Плитки альбома рендерятся лениво: у сообщения вне зоны видимости ссылок ещё нет,
 * поэтому очередь перед чтением подводит сообщение к экрану.
 */
export function mediaItems(message: ParentNode, offset = 0): MediaItem[] {
  const items: MediaItem[] = [];
  const push = (kind: MediaKind, href: string | undefined) => {
    if (!isHttp(href) || items.some((item) => item.href === href)) return;
    items.push({ kind, href, filename: mediaFilename(kind, href, offset + items.length) });
  };

  message.querySelectorAll<HTMLElement>(`${MEDIA_SELECTOR} ${TILE_SELECTOR}`).forEach((tile) => {
    const videos = Array.from(tile.querySelectorAll<HTMLVideoElement>('video'));
    videos.forEach((video) => push('video', videoHref(video)));
    // У плитки с видео картинка — это постер, а не отдельное вложение.
    if (videos.length > 0) return;
    tile.querySelectorAll<HTMLImageElement>('img').forEach((image) => push('photo', image.src));
  });

  return items;
}

export function voicePlayButton(message: ParentNode): HTMLButtonElement | null {
  return message.querySelector<HTMLButtonElement>(VOICE_PLAY_SELECTOR);
}

/** Есть плитки галереи, но ссылок ещё нет — вложения не отрисованы. */
export function hasPendingMedia(message: ParentNode): boolean {
  return Boolean(message.querySelector(`${MEDIA_SELECTOR} ${TILE_SELECTOR}`)) && mediaItems(message).length === 0;
}
