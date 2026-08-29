import { beforeEach, describe, expect, it } from 'vitest';
import { createOwnButton, findActionPanel, findOwnButton, selectedItems, setOwnButtonLabel, updateOwnButton } from '../src/dom';

const mark = '<button class="selection"><span class="selection--status selection--status-selected"></span></button>';

beforeEach(() => {
  document.body.innerHTML = `<div class="actions"><button>Выбрано 2</button><button>Удалить</button><button>Переслать</button></div>
    <div data-index="0"><div class="messageWrapper">${mark}<button aria-label="Скачать"></button></div></div>
    <div data-index="1"><div class="messageWrapper">${mark}<button aria-label="Скачать"></button><button aria-label="Скачать"></button></div></div>
    <div data-index="2"><div class="messageWrapper"><button class="selection"><span class="selection--status"></span></button><button aria-label="Скачать"></button></div></div>`;
});

describe('DOM integration', () => {
  it('finds selected file buttons and action panel without hashed classes', () => {
    expect(selectedItems()).toHaveLength(3);
    expect(findActionPanel()?.element.className).toBe('actions');
    expect(document.querySelector('.svelte-abc')).toBeNull();
  });
  it('ignores selected messages without a download button', () => {
    document.body.insertAdjacentHTML('beforeend', `<div data-index="3"><div class="messageWrapper">${mark}<span>text</span></div></div>`);
    expect(selectedItems()).toHaveLength(3);
  });
  it('creates one own button and updates/removes it safely', () => {
    const panel = findActionPanel()!.element;
    const button = createOwnButton(3);
    panel.append(button);
    expect(findOwnButton(panel)).toBe(button);
    updateOwnButton(button, 1);
    expect(button.textContent).toBe('Скачать файлы (1)');
    button.remove();
    expect(findOwnButton(panel)).toBeNull();
  });
  it('excludes disabled download buttons from the count', () => {
    (document.querySelectorAll('[aria-label="Скачать"]')[0] as HTMLButtonElement).disabled = true;
    expect(selectedItems()).toHaveLength(2);
  });
});

describe('idempotent rendering', () => {
  it('carries MAX button classes', () => {
    expect(createOwnButton(2).className).toBe('button button--xsmall button--ghost svelte-1pwsock max-loader-button');
  });
  it('does not touch the DOM when the label is unchanged', () => {
    const button = createOwnButton(2);
    expect(updateOwnButton(button, 3)).toBe(true);
    expect(updateOwnButton(button, 3)).toBe(false);
    expect(setOwnButtonLabel(button, 'Готово: 3/3')).toBe(true);
    expect(setOwnButtonLabel(button, 'Готово: 3/3')).toBe(false);
  });
  it('restores classes stripped by the app', () => {
    const button = createOwnButton(1);
    button.className = 'button';
    expect(updateOwnButton(button, 1)).toBe(true);
    expect(button.className).toContain('max-loader-button');
  });
});
