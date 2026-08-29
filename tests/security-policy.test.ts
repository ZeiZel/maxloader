import { describe, expect, it, vi } from 'vitest';
import { validateDownloadRequest, validateDownloadUrl } from '../src/domain/download-policy';
import { createRedactedLogger } from '../src/ports/logger';
import { isDownloadRequest, installBackground } from '../src/background';
import { CHANNEL } from '../src/protocol';

const request = (href = 'https://fd.oneme.ru/getfile?rq=1', filename = 'x.md') => ({ channel: CHANNEL, type: 'download', href, filename });

describe('download policy', () => {
  it.each([
    ['https://fd.oneme.ru/getfile?rq=1', true],
    ['https://i.oneme.ru/i?r=1', true],
    ['https://a.oneme.ru/audio?cid=1', true],
    ['https://maxvd12.okcdn.ru/?id=1', true],
    ['http://fd.oneme.ru/getfile', false],
    ['https://evil.oneme.ru/getfile', false],
    ['https://fd.oneme.ru/other', false],
    ['https://user:pass@fd.oneme.ru/getfile', false],
    ['https://fd.oneme.ru:443/getfile', false],
  ])('checks exact URL policy: %s', (href, allowed) => expect(validateDownloadUrl(href as string) === undefined).toBe(allowed));

  it('rejects unsafe filenames before downloads', () => {
    for (const filename of ['', '..', '../x', 'a/b', 'bad\0name', 'x'.repeat(256)]) {
      expect(validateDownloadRequest(request(undefined, filename)).ok).toBe(false);
    }
    expect(isDownloadRequest(request())).toBe(true);
  });

  it('requires extension sender, top frame and MAX tab origin', () => {
    const listener = vi.fn();
    const runtime = { id: 'ext', onMessage: { addListener: listener } } as unknown as typeof chrome.runtime;
    const downloads = { download: vi.fn() } as unknown as typeof chrome.downloads;
    installBackground(runtime, downloads);
    const handler = listener.mock.calls[0][0] as Function;
    const sendResponse = vi.fn();
    expect(handler(request(), { id: 'other', frameId: 0, tab: { url: 'https://web.max.ru/0' } }, sendResponse)).toBe(false);
    expect(handler(request(), { id: 'ext', frameId: 1, tab: { url: 'https://web.max.ru/0' } }, sendResponse)).toBe(false);
    expect(handler(request(), { id: 'ext', frameId: 0, tab: { url: 'https://evil.example/' } }, sendResponse)).toBe(false);
    expect(downloads.download).not.toHaveBeenCalled();
  });

  it('redacts private fields in structured logs', () => {
    const write = vi.fn();
    createRedactedLogger(write).warn('rejected', { href: 'https://fd.oneme.ru/?token=secret', filename: 'private.pdf', kind: 'file' });
    expect(write).toHaveBeenCalledWith('warn', 'rejected', { href: '[redacted]', filename: '[redacted]', kind: 'file' });
  });
});

describe('static safety guard', () => {
  it('does not ship hashed Svelte classes', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const files = (await readdir(join(process.cwd(), 'src'), { recursive: true })) as string[];
    for (const file of files.filter((name) => name.endsWith('.ts') || name.endsWith('.css'))) {
      expect(await readFile(join(process.cwd(), 'src', file), 'utf8')).not.toMatch(/svelte-[A-Za-z0-9_-]+/);
    }
  });
});
