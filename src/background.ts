import { CHANNEL, type DownloadRequest, type DownloadResponse } from './protocol';
import { validateDownloadRequest } from './domain/download-policy';
import { noopLogger, type Logger } from './ports/logger';

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
  validateDownloadRequest(value).ok;

export async function startDownload(
  request: DownloadRequest,
  downloads: typeof chrome.downloads,
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

export function installBackground(
  runtime: typeof chrome.runtime,
  downloads: typeof chrome.downloads,
  logger: Logger = noopLogger,
  expectedOrigin = 'https://web.max.ru',
): void {
  runtime.onMessage.addListener((message, sender, sendResponse) => {
    const policy = validateDownloadRequest(message);
    const tabUrl = sender.tab?.url;
    const senderOk = Boolean(sender.id === runtime.id && sender.tab && sender.frameId === 0 &&
      typeof tabUrl === 'string' && tabUrl.startsWith(`${expectedOrigin}/`));
    if (!policy.ok || !senderOk) {
      logger.warn('download-rejected', { reason: policy.ok ? 'sender-context' : policy.reason });
      return false;
    }
    void startDownload(policy.request, downloads).then(sendResponse);
    return true; // ответ придёт асинхронно
  });
}
