import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPageHook } from '../src/page-hook';
import { createDownloadBridge } from '../src/download-bridge';
import { isDownloadRequest, sanitizeFilename, startDownload } from '../src/background';
import { ARMED_ATTRIBUTE, CAPTURE_EVENT, CHANNEL } from '../src/protocol';

const win = window as Window & typeof globalThis;
let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.(); uninstall = undefined;
  document.documentElement.removeAttribute(ARMED_ATTRIBUTE);
  document.body.innerHTML = '';
});

const anchor = (href: string, filename: string) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.append(a);
  return a;
};

describe('page hook', () => {
  it('lets the page download normally when not armed', () => {
    uninstall = installPageHook(win);
    const a = anchor('https://fd.oneme.ru/getfile?rq=1', 'a.md');
    const captured: unknown[] = [];
    document.addEventListener(CAPTURE_EVENT, (e) => captured.push(e));
    a.click();
    expect(captured).toHaveLength(0);
  });

  it('captures armed anchor downloads instead of letting Chrome throttle them', async () => {
    uninstall = installPageHook(win);
    const seen: string[] = [];
    document.addEventListener(CAPTURE_EVENT, (e) => seen.push((e as CustomEvent).detail.filename));
    document.documentElement.setAttribute(ARMED_ATTRIBUTE, '1');
    anchor('https://fd.oneme.ru/getfile?rq=1', 'a.md').click();
    anchor('https://fd.oneme.ru/getfile?rq=2', 'b.md').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(['a.md', 'b.md']);
  });

  it('ignores navigation anchors that are not downloads', async () => {
    uninstall = installPageHook(win);
    const seen: unknown[] = [];
    document.addEventListener(CAPTURE_EVENT, (e) => seen.push(e));
    document.documentElement.setAttribute(ARMED_ATTRIBUTE, '1');
    const a = document.createElement('a');
    a.href = 'https://example.com/page';
    document.body.append(a);
    a.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toHaveLength(0);
  });
});

describe('bridge', () => {
  it('reports the hook as missing when the MAIN world script did not run', () => {
    const bridge = createDownloadBridge(win, async () => ({ ok: true, id: 1 }));
    expect(bridge.arm()).toBe(false);
    bridge.disarm();
    bridge.dispose();
  });

  it('forwards every captured link to the background and counts them', async () => {
    uninstall = installPageHook(win);
    const sent: string[] = [];
    const bridge = createDownloadBridge(win, async (request) => { sent.push(request.filename); return { ok: true, id: sent.length }; });
    expect(bridge.arm()).toBe(true);
    anchor('https://fd.oneme.ru/getfile?rq=1', 'a.md').click();
    anchor('https://fd.oneme.ru/getfile?rq=2', 'b.md').click();
    anchor('https://fd.oneme.ru/getfile?rq=3', 'c.md').click();
    const stats = await bridge.settle(3, 2000);
    expect(sent).toEqual(['a.md', 'b.md', 'c.md']);
    expect(stats).toEqual({ started: 3, failed: 0 });
    bridge.disarm();
    bridge.dispose();
  });

  it('falls back to a page download when chrome.downloads refuses', async () => {
    uninstall = installPageHook(win);
    const bridge = createDownloadBridge(win, async () => ({ ok: false, error: 'blocked' }));
    bridge.arm();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    anchor('https://fd.oneme.ru/getfile?rq=1', 'a.md').click();
    const stats = await bridge.settle(1, 2000);
    expect(stats).toEqual({ started: 0, failed: 1 });
    // исходный клик + запасной якорь, созданный мостом
    expect(clicked.mock.calls.length).toBeGreaterThanOrEqual(2);
    clicked.mockRestore();
    bridge.disarm();
    bridge.dispose();
  });

  it('gives up after the timeout instead of hanging the button', async () => {
    const bridge = createDownloadBridge(win, async () => ({ ok: true, id: 1 }));
    const stats = await bridge.settle(5, 50);
    expect(stats).toEqual({ started: 0, failed: 0 });
    bridge.dispose();
  });
});

describe('background', () => {
  it('accepts only well-formed http(s) requests', () => {
    expect(isDownloadRequest({ channel: CHANNEL, type: 'download', href: 'https://a/b', filename: 'x' })).toBe(true);
    expect(isDownloadRequest({ channel: CHANNEL, type: 'download', href: 'javascript:alert(1)', filename: 'x' })).toBe(false);
    expect(isDownloadRequest({ channel: 'other', type: 'download', href: 'https://a/b', filename: 'x' })).toBe(false);
  });

  it('strips paths and control characters from the filename', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('a/b/Go-guide.md')).toBe('Go-guide.md');
    expect(sanitizeFilename('..')).toBe('download');
    expect(sanitizeFilename('bad:name?.txt')).toBe('bad_name_.txt');
  });

  it('surfaces download API errors instead of throwing', async () => {
    const downloads = { download: vi.fn().mockRejectedValue(new Error('nope')) } as unknown as typeof chrome.downloads;
    await expect(startDownload({ channel: CHANNEL, type: 'download', href: 'https://a/b', filename: 'x' }, downloads))
      .resolves.toEqual({ ok: false, error: 'nope' });
  });
});
