/** Общий протокол между MAIN-хуком, контент-скриптом и service worker. */
export const CHANNEL = 'max-loader';

/**
 * Признак «очередь работает, перехватывай скачивания» и признак «хук установлен».
 * Это атрибуты на <html>, а не postMessage: DOM общий для isolated- и MAIN-мира,
 * поэтому хук видит взведённый флаг синхронно — уже на первом клике очереди.
 */
export const ARMED_ATTRIBUTE = 'data-max-loader-armed';
export const HOOK_ATTRIBUTE = 'data-max-loader-hook';
/** Якорь, созданный нами самими для запасного скачивания, — хук обязан его пропустить,
 *  иначе перехват и запасной путь зацикливаются друг на друге. */
export const FALLBACK_ATTRIBUTE = 'data-max-loader-fallback';

/** Через сколько хук сам снимает флаг, если очередь упала и не убрала его. */
export const ARM_TIMEOUT_MS = 60_000;

/**
 * Пойманная ссылка едет из MAIN-мира в isolated через CustomEvent на общем document.
 * postMessage тут не годится: его слышит и вложенный iframe, а origin/source
 * зависят от окружения — DOM-событие адресно и не покидает документ.
 */
export const CAPTURE_EVENT = `${CHANNEL}:capture`;

export interface CaptureDetail { href: string; filename: string }

export const isCaptureDetail = (value: unknown): value is CaptureDetail =>
  typeof value === 'object' && value !== null &&
  typeof (value as CaptureDetail).filename === 'string' &&
  typeof (value as CaptureDetail).href === 'string' &&
  /^https?:/i.test((value as CaptureDetail).href);

export interface DownloadRequest { channel: typeof CHANNEL; type: 'download'; href: string; filename: string }
export type DownloadResponse = { ok: true; id: number } | { ok: false; error: string };
