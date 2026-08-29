import { VOICE_EXTENSION, mediaFilename, type MediaItem } from './media';

/** Сколько ждём, пока проигрывание подставит ссылку в общий `<audio>`. */
export const VOICE_RESOLVE_TIMEOUT_MS = 6000;
const POLL_INTERVAL_MS = 50;

/**
 * У голосового ссылки в DOM нет: MAX держит один общий `<audio>` на всё приложение
 * и подставляет `src` только когда сообщение начинают слушать. Поэтому единственный
 * способ узнать ссылку — нажать «play», дождаться смены `src` и сразу остановить.
 *
 * Побочный эффект: чужое голосовое после этого считается прослушанным. Обойти нечем —
 * ссылку выдаёт сервер именно на проигрывание.
 */
export async function resolveVoiceHref(
  doc: Document,
  play: HTMLButtonElement,
  timeoutMs = VOICE_RESOLVE_TIMEOUT_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<string | undefined> {
  const before = currentAudioSource(doc);
  play.click();

  // Считаем попытки, а не стенные часы: с подменённым sleep опрос по Date.now()
  // выродился бы в холостой цикл на всю длительность таймаута.
  const attempts = Math.max(1, Math.ceil(timeoutMs / POLL_INTERVAL_MS));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const href = currentAudioSource(doc);
    if (href && href !== before && /^https?:/i.test(href)) {
      stopPlayback(doc);
      return href;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  stopPlayback(doc);
  return undefined;
}

function currentAudioSource(doc: Document): string {
  const audio = doc.querySelector<HTMLAudioElement>('audio');
  return audio?.currentSrc || audio?.src || '';
}

/** Возвращаем плеер в исходное состояние — мы его трогали только ради ссылки. */
function stopPlayback(doc: Document): void {
  doc.querySelectorAll<HTMLAudioElement>('audio').forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* элемент уже отсоединён */
    }
  });
}

export function voiceItem(href: string, index: number): MediaItem {
  return { kind: 'voice', href, filename: mediaFilename('voice', href, index) };
}

export { VOICE_EXTENSION };
