import { describe, expect, it, vi } from 'vitest';
import { createController } from '../src/content';

const fixture = () => {
  document.body.innerHTML = `<div class="actions"><button>Выбрано 2</button><button>Удалить</button><button>Переслать</button></div>
    <div data-index="0"><div class="messageWrapper messageWrapper--selection">
      <button class="selection"><span class="selection--status selection--status-selected"></span></button>
      <button aria-label="Скачать"></button><button aria-label="Скачать"></button></div></div>`;
};

describe('controller lifecycle', () => {
  it('cancels a pending animation-frame reconcile on stop', () => {
    vi.useFakeTimers(); fixture();
    const controller = createController(document);
    controller.start();
    controller.stop();
    vi.runAllTimers();
    expect(document.querySelectorAll('[data-max-loader-action]')).toHaveLength(0);
    vi.useRealTimers();
  });
  it('removes stale buttons when panel is replaced or files disappear', () => {
    fixture(); const controller = createController(document); controller.reconcile();
    const oldPanel = document.querySelector('.actions')!; expect(oldPanel.querySelectorAll('[data-max-loader-action]')).toHaveLength(1);
    oldPanel.replaceWith(document.createElement('div')); controller.reconcile();
    expect(document.querySelectorAll('[data-max-loader-action]')).toHaveLength(0);
  });

  it('keeps final/progress text while queue is running and prevents duplicates', async () => {
    vi.useFakeTimers(); fixture(); const controller = createController(document, 300); controller.reconcile();
    const own = document.querySelector('[data-max-loader-action]') as HTMLButtonElement;
    const downloads = Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-label="Скачать"]'));
    downloads.forEach((button) => { button.onclick = () => controller.reconcile(); });
    own.click();
    expect(controller.isRunning()).toBe(true);
    // Счётчик растёт после того, как разрешится скачивание вложения, — это микротакт после клика.
    await vi.advanceTimersByTimeAsync(0);
    expect(own.textContent).toBe('Скачивание 1/2');
    controller.reconcile(); expect(document.querySelectorAll('[data-max-loader-action]')).toHaveLength(1); expect(own.textContent).toBe('Скачивание 1/2');
    await vi.runAllTimersAsync(); await Promise.resolve();
    expect(own.textContent).toBe('Готово: 2/2');
    vi.useRealTimers();
  });
});

describe('reconcile is idempotent (no repaint loop)', () => {
  it('makes no DOM mutations once the button is in place', async () => {
    fixture();
    const controller = createController(document);
    controller.reconcile();
    const records: MutationRecord[] = [];
    const spy = new MutationObserver((list) => records.push(...list));
    spy.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    controller.reconcile();
    controller.reconcile();
    await Promise.resolve();
    spy.disconnect();
    expect(records).toHaveLength(0);
  });

  it('does not re-arm the click handler on every reconcile', () => {
    fixture();
    const controller = createController(document, 0);
    controller.reconcile();
    const own = document.querySelector('[data-max-loader-action]') as HTMLButtonElement;
    controller.reconcile();
    controller.reconcile();
    const clicks = document.querySelectorAll<HTMLButtonElement>('[aria-label="Скачать"]');
    let fired = 0;
    clicks.forEach((button) => { button.onclick = () => { fired += 1; }; });
    own.click();
    expect(fired).toBe(1);
  });
});
