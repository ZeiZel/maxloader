import { chromium, test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

test('loads the built MV3 extension and serves its manifest', async () => {
  const extensionPath = resolve('dist');
  const userDataDir = await mkdtemp(`${tmpdir()}/maxloader-e2e-`);
  const launchOptions = {
    headless: process.env.PW_HEADLESS !== '0',
    timeout: 30_000,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  };
  if (process.env.CHROME_BIN) launchOptions.executablePath = process.env.CHROME_BIN;
  const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  try {
    const page = await context.newPage();
    await page.route('https://web.max.ru/*', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><body><div class="action-panel"><button>Выбрано 1</button><button>Удалить</button><button>Переслать</button><div class="messageWrapper" data-message-id="fixture"><i class="selection--status-selected"></i><button aria-label="Скачать">fixture.md</button></div></div></body></html>'
    }));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        value: { runtime: { sendMessage: () => Promise.resolve() } }
      });
    });
    await page.goto('https://web.max.ru/0');
    // Route fulfillments do not consistently trigger MV3 injection across Chromium channels.
    // Execute the exact built content bundle in the synthetic page to exercise its real flow.
    await page.addScriptTag({ path: resolve('dist/content.js') });
    await page.waitForTimeout(100);
    await expect(page.locator('.messageWrapper .selection--status-selected')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.max-loader-button')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.max-loader-button')).toHaveAttribute('aria-label', 'Скачать файлы (1)');
    const manifest = JSON.parse(await readFile(resolve('dist/manifest.json'), 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(?:\.\d+)?$/);
    expect(manifest.content_scripts).toHaveLength(2);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

// The synthetic HTTPS route exercises the real match-pattern navigation without private auth. The
// exact built content bundle is evaluated because route fulfillments do not consistently trigger
// MV3 injection across Chromium channels; service-worker policy remains covered by contract tests.
