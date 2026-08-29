import { CHANNEL, type DownloadRequest, type DownloadResponse } from './protocol';

/**
 * chrome.downloads отвергает пути, `..` и управляющие символы,
 * поэтому от имени файла оставляем только безопасную базовую часть.
 */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1f<>:"|?*]/g, '_').replace(/^\.+/, '').trim();
  return cleaned || 'download';
}

export const isDownloadRequest = (value: unknown): value is DownloadRequest =>
  typeof value === 'object' && value !== null &&
  (value as DownloadRequest).channel === CHANNEL &&
  (value as DownloadRequest).type === 'download' &&
  typeof (value as DownloadRequest).href === 'string' &&
  /^https?:/i.test((value as DownloadRequest).href);

export async function startDownload(
  request: DownloadRequest,
  downloads: typeof chrome.downloads = chrome.downloads,
): Promise<DownloadResponse> {
  try {
    const id = await downloads.download({
      url: request.href,
      filename: sanitizeFilename(request.filename),
      conflictAction: 'uniquify',
      saveAs: false,
    });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function installBackground(runtime: typeof chrome.runtime = chrome.runtime): void {
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isDownloadRequest(message)) return false;
    void startDownload(message).then(sendResponse);
    return true; // ответ придёт асинхронно
  });
}
