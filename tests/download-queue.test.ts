import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDownloadQueue } from '../src/download-queue';

/**
 * Разметка повторяет проверенную на web.max.ru (2026-08-27): документ отдаёт кнопку
 * `aria-label="Скачать"`, фото и видео лежат в `.media`, голосовое — в `.attachAudio`.
 */
const IMAGE = 'https://i.oneme.ru/i?r=PHOTOID1&expires=1';
const VIDEO = 'https://maxvd1.okcdn.ru/?id=VIDEOID1&sig=abc';
const VOICE = 'https://a.oneme.ru/audio?cid=VOICEID1&signatureToken=t';

/** Выбранное сообщение: в кружке слева стоит галочка. */
const message = (index: number, inner: string) =>
  `<div data-index="${index}"><div class="messageWrapper messageWrapper--selection">` +
  `<button class="selection"><span class="selection--status selection--status-selected"></span></button>` +
  `${inner}</div></div>`;

/** Невыбранное сообщение в том же режиме выбора — класс `--selection` у него тоже есть. */
const unselected = (index: number, inner: string) =>
  `<div data-index="${index}"><div class="messageWrapper messageWrapper--selection">` +
  `<button class="selection"><span class="selection--status"></span></button>` +
  `${inner}</div></div>`;

const fileMessage = (index: number) => message(index, '<button aria-label="Скачать"></button>');
const photoMessage = (index: number, src = IMAGE) =>
  message(index, `<div class="media"><div class="grid"><button class="tile"><img src="${src}"></button></div></div>`);
const videoMessage = (index: number) =>
  message(
    index,
    `<div class="media"><div class="grid"><button class="tile"><div class="video"><video><source src="${VIDEO}" type="video/mp4"></video></div></button></div></div>`,
  );
const voiceMessage = (index: number) =>
  message(index, '<div class="attachAudio"><div class="buttonWrapper"><button></button></div></div>');

const collect = () => {
  const saved: { href: string; filename: string }[] = [];
  return { saved, download: (href: string, filename: string) => saved.push({ href, filename }) };
};

const run = (overrides: Partial<Parameters<typeof runDownloadQueue>[0]> = {}) => {
  const { saved, download } = collect();
  return {
    saved,
    promise: runDownloadQueue({ doc: document, intervalMs: 0, renderWaitMs: 0, download, ...overrides }),
  };
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('документы', () => {
  it('кликает по кнопкам последовательно с интервалом и сообщает прогресс', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = [0, 1, 2].map(fileMessage).join('');
    const clicked: number[] = [];
    document.querySelectorAll('button[aria-label]').forEach((button, index) => {
      button.addEventListener('click', () => clicked.push(index));
    });
    const progress: string[] = [];
    const { promise } = run({ intervalMs: 300, onProgress: (done, total) => progress.push(`${done}/${total}`) });

    await vi.advanceTimersByTimeAsync(0);
    expect(clicked).toEqual([0]);
    await vi.advanceTimersByTimeAsync(299);
    expect(clicked).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(clicked).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(300);

    const result = await promise;
    expect(clicked).toEqual([0, 1, 2]);
    expect(result).toMatchObject({ completed: 3, errors: 0, direct: 0, total: 3 });
    expect(progress.at(-1)).toBe('3/3');
    vi.useRealTimers();
  });

  it('продолжает после ошибки клика и пропускает выключенные кнопки', async () => {
    document.body.innerHTML = fileMessage(0) + fileMessage(1) + fileMessage(2);
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]'));
    buttons[0].click = () => {
      throw new Error('boom');
    };
    buttons[1].disabled = true;
    let clicked = false;
    buttons[2].addEventListener('click', () => {
      clicked = true;
    });

    const result = await run().promise;
    expect(result).toMatchObject({ completed: 1, errors: 1, total: 2 });
    expect(clicked).toBe(true);
  });
});

describe('медиа', () => {
  it('качает фото прямой ссылкой с расширением webp', async () => {
    document.body.innerHTML = photoMessage(0);
    const { saved, promise } = run();
    const result = await promise;
    expect(saved).toEqual([{ href: IMAGE, filename: 'max-photo-PHOTOID1.webp' }]);
    expect(result).toMatchObject({ completed: 1, direct: 1, errors: 0 });
  });

  it('берёт ссылку видео из <source> и называет файл mp4', async () => {
    document.body.innerHTML = videoMessage(0);
    const { saved, promise } = run();
    const result = await promise;
    expect(saved).toEqual([{ href: VIDEO, filename: 'max-video-VIDEOID1.mp4' }]);
    expect(result).toMatchObject({ completed: 1, direct: 1, errors: 0 });
  });

  it('забирает все вложения альбома и не дублирует одинаковые ссылки', async () => {
    document.body.innerHTML = message(
      0,
      `<div class="media"><div class="grid">
        <button class="tile"><img src="${IMAGE}"></button>
        <button class="tile"><img src="${IMAGE}"></button>
        <button class="tile"><img src="https://i.oneme.ru/i?r=PHOTOID2&expires=1"></button>
      </div></div>`,
    );
    const { saved, promise } = run();
    await promise;
    expect(saved.map((entry) => entry.filename)).toEqual(['max-photo-PHOTOID1.webp', 'max-photo-PHOTOID2.webp']);
  });

  it('не путается, когда у сообщения с медиа есть ещё и текст', async () => {
    document.body.innerHTML = message(
      0,
      `<div class="bubbleContent"><div class="media"><div class="grid"><button class="tile"><img src="${IMAGE}"></button></div></div><span class="text">С текстом</span></div>`,
    );
    const { saved, promise } = run();
    await promise;
    expect(saved).toHaveLength(1);
  });

  it('не считает вложением картинку превью ссылки', async () => {
    // MAX вешает класс media и на превью ссылки в тексте — настоящее вложение всегда в плитке.
    document.body.innerHTML = message(
      0,
      '<button class="cell cell--webapp"><span class="text"><span class="media"><div>' +
        `<img src="https://i.oneme.ru/i?r=PREVIEW1&expires=1"></div></span></span></button>`,
    );
    const { saved, promise } = run();
    const result = await promise;
    expect(saved).toHaveLength(0);
    expect(result).toMatchObject({ completed: 0, total: 0 });
  });

  it('берёт из плитки с видео только само видео, а не его постер', async () => {
    document.body.innerHTML = message(
      0,
      `<div class="media"><div class="grid"><button class="tile"><img src="${IMAGE}">` +
        `<div class="video"><video><source src="${VIDEO}" type="video/mp4"></video></div></button></div></div>`,
    );
    const { saved, promise } = run();
    await promise;
    expect(saved).toEqual([{ href: VIDEO, filename: 'max-video-VIDEOID1.mp4' }]);
  });

  it('перечитывает сообщение после подвода к экрану, когда плитка отрисовалась лениво', async () => {
    document.body.innerHTML = message(0, '<div class="media"><div class="grid"><button class="tile"><div></div></button></div></div>');
    const tile = document.querySelector('.tile div')!;
    const { saved, promise } = run({
      renderWaitMs: 5,
      // Пока очередь ждёт отрисовку, приложение подставляет изображение в плитку.
      sleep: async (ms) => {
        if (ms === 5) tile.innerHTML = `<img src="${IMAGE}">`;
      },
    });
    await promise;
    expect(saved).toEqual([{ href: IMAGE, filename: 'max-photo-PHOTOID1.webp' }]);
  });
});

describe('голосовые', () => {
  it('нажимает play, забирает ссылку из общего <audio> и останавливает плеер', async () => {
    document.body.innerHTML = voiceMessage(0);
    const play = document.querySelector<HTMLButtonElement>('.attachAudio button')!;
    const audio = document.createElement('audio');
    document.body.append(audio);
    play.addEventListener('click', () => {
      audio.src = VOICE;
    });

    const { saved, promise } = run();
    const result = await promise;

    expect(saved).toEqual([{ href: VOICE, filename: 'max-voice-VOICEID1.ogg' }]);
    expect(result).toMatchObject({ completed: 1, direct: 1, errors: 0 });
    expect(audio.paused).toBe(true);
  });

  it('считает ошибкой голосовое, у которого ссылка так и не появилась', async () => {
    document.body.innerHTML = voiceMessage(0);
    const { saved, promise } = run({ sleep: async () => undefined });
    const result = await promise;
    expect(saved).toHaveLength(0);
    expect(result).toMatchObject({ completed: 0, errors: 1 });
  });
});

describe('границы выделения', () => {
  it('берёт только отмеченные сообщения, а не весь чат в режиме выбора', async () => {
    // MAX помечает классом `messageWrapper--selection` каждое сообщение, как только
    // включён режим выбора, — по нему в очередь уезжал весь чат.
    document.body.innerHTML =
      unselected(0, `<div class="media"><div class="grid"><button class="tile"><img src="${IMAGE}"></button></div></div>`) +
      photoMessage(1, 'https://i.oneme.ru/i?r=WANTED&expires=1') +
      unselected(2, '<button aria-label="Скачать"></button>');

    const { saved, promise } = run();
    const result = await promise;

    expect(saved).toEqual([{ href: 'https://i.oneme.ru/i?r=WANTED&expires=1', filename: 'max-photo-WANTED.webp' }]);
    expect(result).toMatchObject({ completed: 1, total: 1 });
  });
});

describe('смешанное выделение', () => {
  it('обрабатывает документ, фото, видео и голосовое в одном заходе', async () => {
    document.body.innerHTML = fileMessage(0) + photoMessage(1) + videoMessage(2) + voiceMessage(3);
    const audio = document.createElement('audio');
    document.body.append(audio);
    document.querySelector<HTMLButtonElement>('.attachAudio button')!.addEventListener('click', () => {
      audio.src = VOICE;
    });

    const { saved, promise } = run();
    const result = await promise;

    expect(result).toMatchObject({ completed: 4, direct: 3, errors: 0, total: 4 });
    expect(saved.map((entry) => entry.filename)).toEqual([
      'max-photo-PHOTOID1.webp',
      'max-video-VIDEOID1.mp4',
      'max-voice-VOICEID1.ogg',
    ]);
  });
});
