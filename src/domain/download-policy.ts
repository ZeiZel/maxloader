import { CHANNEL, type DownloadRequest } from '../protocol';

export type DownloadRejectReason =
  | 'malformed-request' | 'unsupported-channel' | 'unsafe-url' | 'disallowed-host'
  | 'disallowed-path' | 'unsafe-filename';

export type DownloadPolicyResult = {
  ok: true;
  request: DownloadRequest;
} | { ok: false; reason: DownloadRejectReason };

const HOSTS = new Set(['fd.oneme.ru', 'i.oneme.ru', 'a.oneme.ru']);
const MAX_VIDEO_HOST = /^maxvd[0-9]+\.okcdn\.ru$/;
const validFilename = (value: string): boolean => {
  if (value.length === 0 || new TextEncoder().encode(value).byteLength > 255 || value.trim() !== value) return false;
  if (value === '.' || value === '..' || /[\x00-\x1f\x7f]/.test(value)) return false;
  return !/[\\/:*?"<>|]/.test(value) && !/^(?:\.+)$/.test(value);
};

export function validateDownloadUrl(raw: string): DownloadRejectReason | undefined {
  let url: URL;
  try { url = new URL(raw); } catch { return 'unsafe-url'; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || /^https:\/\/[^/]+:\d+(?:\/|$)/i.test(raw)) return 'unsafe-url';
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host) && !MAX_VIDEO_HOST.test(host)) return 'disallowed-host';
  const allowedPath = (host === 'fd.oneme.ru' && url.pathname === '/getfile')
    || (host === 'i.oneme.ru' && url.pathname === '/i')
    || (host === 'a.oneme.ru' && url.pathname === '/audio')
    || (MAX_VIDEO_HOST.test(host) && (url.pathname === '/' || url.pathname === ''));
  return allowedPath ? undefined : 'disallowed-path';
}

export function validateDownloadRequest(value: unknown): DownloadPolicyResult {
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'malformed-request' };
  const request = value as Partial<DownloadRequest>;
  if (request.channel !== CHANNEL || request.type !== 'download') return { ok: false, reason: 'unsupported-channel' };
  if (typeof request.href !== 'string' || validateDownloadUrl(request.href)) return { ok: false, reason: validateDownloadUrl(String(request.href)) ?? 'unsafe-url' };
  if (typeof request.filename !== 'string' || !validFilename(request.filename)) return { ok: false, reason: 'unsafe-filename' };
  return { ok: true, request: request as DownloadRequest };
}

export function isSafeFilename(value: string): boolean { return validFilename(value); }
